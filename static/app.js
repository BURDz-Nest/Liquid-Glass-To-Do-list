const state = { projects: [] };
const board = document.querySelector('#project-board');
const template = document.querySelector('#project-template');
const status = document.querySelector('#save-status');
const dialog = document.querySelector('#project-dialog');
const completedLimit = 7;
let draggingTaskId = null;
const newId = () => crypto.randomUUID();

async function save() {
  status.textContent = 'Saving…';
  try {
    const response = await fetch('/api/checklist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
    if (!response.ok) throw new Error('save failed');
    status.textContent = 'Saved locally';
  } catch (error) { status.textContent = 'Save failed — try again'; console.error(error); }
}

function dateLabel(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function today() { return new Date().toISOString().slice(0, 10); }

function updateSummary() {
  const tasks = state.projects.flatMap(project => project.tasks);
  document.querySelector('#open-count').textContent = tasks.filter(task => !task.done).length;
  document.querySelector('#done-count').textContent = tasks.filter(task => task.done).length;
}

function taskItem(project, task) {
  const item = document.createElement('li');
  item.className = `task-item${task.done ? ' done' : ''}`;
  item.dataset.taskId = task.id;

  const toggle = document.createElement('button');
  toggle.className = 'triangle';
  toggle.textContent = task.done ? '▼' : '▽';
  toggle.setAttribute('aria-label', `Mark ${task.text} as ${task.done ? 'not done' : 'done'}`);
  toggle.onclick = () => {
    task.done = !task.done;
    task.completedAt = task.done ? today() : null;
    render();
    save();
  };

  const text = document.createElement('span');
  text.className = 'task-text';
  text.contentEditable = 'true';
  text.textContent = task.text;
  text.setAttribute('role', 'textbox');
  text.setAttribute('aria-label', 'Task text');
  text.addEventListener('blur', () => {
    task.text = text.textContent.trim() || 'Untitled idea';
    text.textContent = task.text;
    save();
  });
  text.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      text.blur();
    }
  });

  const remove = document.createElement('button');
  remove.className = 'delete-task';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `Delete ${task.text}`);
  remove.onclick = () => {
    project.tasks = project.tasks.filter(current => current.id !== task.id);
    render();
    save();
  };

  if (!task.done) {
    const handle = document.createElement('button');
    handle.className = 'drag-handle';
    handle.type = 'button';
    handle.draggable = true;
    handle.textContent = String.fromCodePoint(0x2261);
    handle.setAttribute('aria-label', `Drag ${task.text} to reorder`);
    handle.title = 'Drag to reorder';
    item.append(handle, toggle, text, remove);
  } else {
    item.append(toggle, text, remove);
  }
  return item;
}

function reorderActiveTasks(project, orderedIds) {
  const orderedTasks = orderedIds.map(id => project.tasks.find(task => task.id === id));
  let nextActiveTask = 0;
  project.tasks = project.tasks.map(task => task.done ? task : orderedTasks[nextActiveTask++]);
}

function setUpActiveTaskDrag(list, project) {
  const activeItems = () => [...list.querySelectorAll('.task-item:not(.done)')];
  list.addEventListener('dragstart', event => {
    const handle = event.target.closest('.drag-handle[draggable="true"]');
    if (!handle) return;
    const item = handle.closest('.task-item');
    if (!item) return;
    draggingTaskId = item.dataset.taskId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggingTaskId);
    requestAnimationFrame(() => item.classList.add('is-dragging'));
  });
  list.addEventListener('dragover', event => {
    if (!draggingTaskId) return;
    event.preventDefault();
    const draggingItem = list.querySelector(`[data-task-id="${draggingTaskId}"]`);
    const target = event.target.closest('.task-item:not(.done)');
    if (!draggingItem || !target || target === draggingItem) return;
    const { top, height } = target.getBoundingClientRect();
    list.insertBefore(draggingItem, event.clientY < top + height / 2 ? target : target.nextSibling);
  });
  list.addEventListener('drop', event => {
    if (!draggingTaskId) return;
    event.preventDefault();
    reorderActiveTasks(project, activeItems().map(item => item.dataset.taskId));
    draggingTaskId = null;
    render();
    save();
  });
  list.addEventListener('dragend', () => {
    draggingTaskId = null;
    list.querySelectorAll('.is-dragging').forEach(item => item.classList.remove('is-dragging'));
  });
}

function renderActive(card, project) {
  const list = card.querySelector('.task-list');
  const showMore = card.querySelector('.show-more-active');
  const active = project.tasks.filter(task => !task.done);
  let expanded = false;

  const paint = () => {
    list.replaceChildren();
    const visible = expanded ? active : active.slice(0, completedLimit);
    visible.forEach(task => list.append(taskItem(project, task)));
    showMore.hidden = active.length <= completedLimit;
    showMore.textContent = expanded
      ? 'Show less ideas'
      : `Show ${active.length - completedLimit} more idea${active.length - completedLimit === 1 ? '' : 's'}`;
  };

  showMore.onclick = () => {
    expanded = !expanded;
    paint();
  };
  paint();
  setUpActiveTaskDrag(list, project);
}

function renderCompleted(card, project) {
  const section = card.querySelector('.completed-section');
  const title = card.querySelector('.completed-title');
  const groups = card.querySelector('.completed-groups');
  const showMore = card.querySelector('.show-more');
  const completed = project.tasks
    .filter(task => task.done)
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  if (!completed.length) return;

  section.hidden = false;
  let sectionExpanded = false;
  let listExpanded = false;

  const paint = () => {
    groups.replaceChildren();
    const visible = listExpanded ? completed : completed.slice(0, completedLimit);
    const byDate = visible.reduce((groupsByDate, task) => {
      const key = task.completedAt || 'Earlier';
      (groupsByDate[key] ||= []).push(task);
      return groupsByDate;
    }, {});
    Object.entries(byDate).forEach(([date, tasks]) => {
      const group = document.createElement('div');
      group.className = 'completed-group';
      const heading = document.createElement('p');
      heading.className = 'date-heading';
      heading.textContent = date === 'Earlier' ? 'Earlier' : dateLabel(date);
      const list = document.createElement('ul');
      list.className = 'task-list completed-list';
      tasks.forEach(task => list.append(taskItem(project, task)));
      group.append(heading, list);
      groups.append(group);
    });
  };

  const updateVisibility = () => {
    title.setAttribute('aria-expanded', String(sectionExpanded));
    groups.hidden = !sectionExpanded;
    showMore.hidden = !sectionExpanded || listExpanded || completed.length <= completedLimit;
  };

  title.onclick = () => {
    sectionExpanded = !sectionExpanded;
    updateVisibility();
  };
  showMore.textContent = `Show ${completed.length - completedLimit} more completed idea${completed.length - completedLimit === 1 ? '' : 's'}`;
  showMore.onclick = () => {
    listExpanded = true;
    paint();
    updateVisibility();
  };

  paint();
  updateVisibility();
}

function render() {
  board.replaceChildren();
  state.projects.forEach(project => {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.projectId = project.id;
    card.dataset.color = project.color;
    const name = card.querySelector('.project-name');
    name.value = project.name;
    name.addEventListener('change', () => { project.name = name.value.trim() || 'Untitled project'; name.value = project.name; save(); });
    const completed = project.tasks.filter(task => task.done).length;
    const total = project.tasks.length;
    card.querySelector('.project-progress').textContent = `${completed} of ${total} shipped`;
    card.querySelector('.progress-fill').style.width = total ? `${(completed / total) * 100}%` : '0%';
    renderActive(card, project);
    renderCompleted(card, project);
    card.querySelector('.add-task-form').addEventListener('submit', event => {
      event.preventDefault();
      const input = card.querySelector('.new-task'); const text = input.value.trim();
      if (!text) return;
      project.tasks.push({ id: newId(), text, done: false, completedAt: null });
      render(); save();
    });
    card.querySelector('[data-action="delete-project"]').onclick = () => {
      if (confirm(`Delete ${project.name} and all its ideas?`)) { state.projects = state.projects.filter(current => current.id !== project.id); render(); save(); }
    };
    board.append(card);
  });
  updateSummary();
}

function closeProjectDialog() { dialog.close(); }
document.querySelector('#add-project').onclick = () => { document.querySelector('#project-form').reset(); dialog.showModal(); document.querySelector('#project-name-input').focus(); };
document.querySelector('.dialog-close').onclick = closeProjectDialog;
document.querySelector('[data-action="cancel-project"]').onclick = closeProjectDialog;
dialog.addEventListener('click', event => { if (event.target === dialog) closeProjectDialog(); });
document.querySelector('#project-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = document.querySelector('#project-name-input').value.trim();
  if (!name) { document.querySelector('#project-name-input').focus(); return; }
  state.projects.push({ id: newId(), name, color: document.querySelector('#project-color').value, tasks: [] });
  closeProjectDialog(); render(); save();
});

fetch('/api/checklist').then(response => response.json()).then(data => { state.projects = data.projects || []; render(); status.textContent = 'Saved locally'; }).catch(error => { status.textContent = 'Could not load checklist'; console.error(error); });
