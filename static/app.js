const state = { projects: [] };
const board = document.querySelector('#project-board');
const template = document.querySelector('#project-template');
const status = document.querySelector('#save-status');
const dialog = document.querySelector('#project-dialog');
const completedLimit = 10;
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
  if (!task.done) {
    item.draggable = true;
    item.title = 'Drag to reorder';
  }
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
  text.addEventListener('blur', () => { task.text = text.textContent.trim() || 'Untitled idea'; text.textContent = task.text; save(); });
  text.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); text.blur(); } });
  const remove = document.createElement('button');
  remove.className = 'delete-task';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `Delete ${task.text}`);
  remove.onclick = () => { project.tasks = project.tasks.filter(current => current.id !== task.id); render(); save(); };
  item.append(toggle, text, remove);
  return item;
}

function reorderActiveTasks(project, orderedIds) {
  const orderedTasks = orderedIds.map(id => project.tasks.find(task => task.id === id));
  let nextActiveTask = 0;
  project.tasks = project.tasks.map(task => task.done ? task : orderedTasks[nextActiveTask++]);
}

function setUpActiveTaskDrag(list, project) {
  const activeItems = () => [...list.querySelectorAll('.task-item[draggable="true"]')];
  list.addEventListener('dragstart', event => {
    const item = event.target.closest('.task-item[draggable="true"]');
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
    const target = event.target.closest('.task-item[draggable="true"]');
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

function renderCompleted(card, project) {
  const section = card.querySelector('.completed-section');
  const groups = card.querySelector('.completed-groups');
  const completed = project.tasks.filter(task => task.done).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  if (!completed.length) return;
  section.hidden = false;
  let expanded = false;
  const paint = () => {
    groups.replaceChildren();
    const visible = expanded ? completed : completed.slice(0, completedLimit);
    const byDate = visible.reduce((groupsByDate, task) => {
      const key = task.completedAt || 'Earlier';
      (groupsByDate[key] ||= []).push(task);
      return groupsByDate;
    }, {});
    Object.entries(byDate).forEach(([date, tasks]) => {
      const group = document.createElement('div'); group.className = 'completed-group';
      const heading = document.createElement('p'); heading.className = 'date-heading'; heading.textContent = date === 'Earlier' ? 'Earlier' : dateLabel(date);
      const list = document.createElement('ul'); list.className = 'task-list completed-list';
      tasks.forEach(task => list.append(taskItem(project, task)));
      group.append(heading, list); groups.append(group);
    });
  };
  const showMore = card.querySelector('.show-more');
  showMore.hidden = completed.length <= completedLimit;
  showMore.textContent = `Show ${completed.length - completedLimit} more completed idea${completed.length - completedLimit === 1 ? '' : 's'}`;
  showMore.onclick = () => { expanded = true; showMore.hidden = true; paint(); };
  paint();
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
    const activeList = card.querySelector('.task-list');
    project.tasks.filter(task => !task.done).forEach(task => activeList.append(taskItem(project, task)));
    setUpActiveTaskDrag(activeList, project);
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
