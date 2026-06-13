/**
 * Admin Panel Module
 * Renders the admin management interface for users, roles, and groups.
 */
import { getAllProfiles, updateUserRole, getAllGroups, createGroup, updateGroup, deleteGroup, getGroupMembers, removeWorkerFromGroup } from './dataStore.js';
import { escapeHtml } from './utils.js';

let cachedProfiles = [];
let cachedGroups = [];

/**
 * Render the full admin panel.
 */
export async function renderAdminPanel() {
  const container = document.getElementById('adminContent');
  if (!container) return;

  container.style.opacity = '0.4';

  try {
    const [profiles, groups] = await Promise.all([
      getAllProfiles(),
      getAllGroups(),
    ]);
    cachedProfiles = profiles;
    cachedGroups = groups;

    renderUserManagement(profiles);
    renderGroupManagement(groups, profiles);
    renderGroupMembersSection(groups);
  } catch (err) {
    console.error('Admin panel error:', err);
  } finally {
    container.style.opacity = '1';
  }
}

// ── User Management ─────────────────────────────────

function renderUserManagement(profiles) {
  const tbody = document.getElementById('adminUsersBody');
  if (!tbody) return;

  if (profiles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No hay usuarios registrados</td></tr>';
    return;
  }

  tbody.innerHTML = profiles.map(p => {
    const roleBadge = getRoleBadge(p.role);
    const isAdmin = p.role === 'admin';
    const fullName = escapeHtml(p.full_name || 'Sin nombre');
    const avatar = escapeHtml((p.full_name || '?').charAt(0).toUpperCase());

    return `<tr data-user-id="${p.id}">
      <td>
        <div class="admin-user-cell">
          <span class="admin-user-avatar">${avatar}</span>
          <span>${fullName}</span>
        </div>
      </td>
      <td>${roleBadge}</td>
      <td class="admin-user-actions">
        ${!isAdmin ? `
          <select class="role-select" data-user-id="${p.id}" id="roleSelect_${p.id}">
            <option value="worker" ${p.role === 'worker' ? 'selected' : ''}>Trabajador</option>
            <option value="supervisor" ${p.role === 'supervisor' ? 'selected' : ''}>Supervisor</option>
          </select>
          <button class="admin-action-btn save-role-btn" data-user-id="${p.id}" title="Guardar rol">Guardar</button>
        ` : '<span class="admin-protected-badge">Protegido</span>'}
      </td>
    </tr>`;
  }).join('');

  // Bind save role buttons
  tbody.querySelectorAll('.save-role-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.currentTarget.dataset.userId;
      const select = document.getElementById(`roleSelect_${userId}`);
      if (!select) return;

      const newRole = select.value;
      btn.disabled = true;
      btn.textContent = '';

      try {
        await updateUserRole(userId, newRole);
        btn.textContent = '\u2713';
        setTimeout(() => { btn.textContent = 'Guardar'; btn.disabled = false; }, 1500);
        // Refresh
        await renderAdminPanel();
      } catch (err) {
        console.error('Error updating role:', err);
        btn.textContent = 'Error';
        setTimeout(() => { btn.textContent = 'Guardar'; btn.disabled = false; }, 1500);
      }
    });
  });
}

function getRoleBadge(role) {
  const map = {
    admin: '<span class="role-badge role-admin">Admin</span>',
    supervisor: '<span class="role-badge role-supervisor">Supervisor</span>',
    worker: '<span class="role-badge role-worker">Trabajador</span>',
  };
  return map[role] || map.worker;
}

// ── Group Management ────────────────────────────────

function renderGroupManagement(groups, profiles) {
  const tbody = document.getElementById('adminGroupsBody');
  if (!tbody) return;

  // Supervisor options for the create form
  const supervisors = profiles.filter(p => p.role === 'supervisor' || p.role === 'admin');
  const supervisorSelect = document.getElementById('newGroupSupervisor');
  if (supervisorSelect) {
    supervisorSelect.innerHTML = '<option value="">Sin supervisor</option>' +
      supervisors.map(s => `<option value="${s.id}">${escapeHtml(s.full_name || 'Sin nombre')} (${escapeHtml(s.role)})</option>`).join('');
  }

  if (groups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No hay grupos creados</td></tr>';
    return;
  }

  tbody.innerHTML = groups.map(g => {
    const supervisorName = escapeHtml(g.profiles?.full_name || 'No asignado');
    const groupName = escapeHtml(g.name);
    const groupCode = escapeHtml(g.code);
    return `<tr data-group-id="${g.id}">
      <td>
        <div class="admin-group-name">
          <span class="group-icon"></span>
          <span>${groupName}</span>
        </div>
      </td>
      <td>
        <span class="group-code-badge" title="Click para copiar" data-code="${groupCode}">${groupCode}</span>
      </td>
      <td>${supervisorName}</td>
      <td>
        <button class="admin-action-btn view-members-btn" data-group-id="${g.id}" data-group-name="${groupName}" title="Ver miembros">Ver</button>
        <button class="admin-action-btn delete-group-btn danger" data-group-id="${g.id}" title="Eliminar grupo">Eliminar</button>
      </td>
    </tr>`;
  }).join('');

  // Bind copy code
  tbody.querySelectorAll('.group-code-badge').forEach(el => {
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(el.dataset.code).then(() => {
        const original = el.textContent;
        el.textContent = 'Copiado';
        setTimeout(() => { el.textContent = original; }, 1500);
      });
    });
  });

  // Bind view members
  tbody.querySelectorAll('.view-members-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const groupId = btn.dataset.groupId;
      const groupName = btn.dataset.groupName;
      showGroupMembers(groupId, groupName);
    });
  });

  // Bind delete group
  tbody.querySelectorAll('.delete-group-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const groupId = btn.dataset.groupId;
      if (!confirm('¿Estás seguro de eliminar este grupo? Los miembros serán desvinculados.')) return;

      btn.disabled = true;
      btn.textContent = '';
      try {
        await deleteGroup(groupId);
        await renderAdminPanel();
      } catch (err) {
        console.error('Error deleting group:', err);
        btn.textContent = 'Error';
        setTimeout(() => { btn.textContent = 'Eliminar'; btn.disabled = false; }, 1500);
      }
    });
  });
}

// ── Group Members Modal ─────────────────────────────

async function showGroupMembers(groupId, groupName) {
  const modal = document.getElementById('groupMembersModal');
  const title = document.getElementById('groupMembersTitle');
  const list = document.getElementById('groupMembersList');
  if (!modal || !list) return;

  if (title) title.textContent = `Miembros: ${groupName}`;
  list.innerHTML = '<div class="admin-loading"> Cargando...</div>';
  modal.classList.add('active');

  try {
    const members = await getGroupMembers(groupId);

    if (members.length === 0) {
      list.innerHTML = '<div class="admin-empty-state"><p>No hay miembros en este grupo</p></div>';
      return;
    }

    list.innerHTML = members.map(m => {
      const name = escapeHtml(m.profiles?.full_name || 'Sin nombre');
      const avatar = escapeHtml(name.charAt(0).toUpperCase());
      const joinDate = new Date(m.joined_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

      return `<div class="group-member-item">
        <div class="group-member-info">
          <span class="group-member-avatar">${avatar}</span>
          <div>
            <div class="group-member-name">${name}</div>
            <div class="group-member-joined">Unido: ${joinDate}</div>
          </div>
        </div>
        <button class="admin-action-btn danger remove-member-btn" data-user-id="${m.user_id}" data-group-id="${groupId}" title="Remover del grupo">Quitar</button>
      </div>`;
    }).join('');;

    // Bind remove
    list.querySelectorAll('.remove-member-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.userId;
        const gId = btn.dataset.groupId;
        btn.disabled = true;
        btn.textContent = '';
        try {
          await removeWorkerFromGroup(userId, gId);
          await showGroupMembers(gId, groupName);
        } catch (err) {
          console.error('Error removing member:', err);
          btn.textContent = 'Error';
          setTimeout(() => { btn.textContent = 'Quitar'; btn.disabled = false; }, 1500);
        }
      });
    });
  } catch (err) {
    console.error('Error loading members:', err);
    list.innerHTML = '<div class="admin-empty-state"><p>Error cargando miembros</p></div>';
  }
}

function renderGroupMembersSection() {
  // Close modal handler
  const modal = document.getElementById('groupMembersModal');
  const closeBtn = document.getElementById('closeGroupMembersModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => modal?.classList.remove('active'));
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }
}

/**
 * Setup create group form handler.
 */
export function setupAdminListeners() {
  const form = document.getElementById('createGroupForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('newGroupName');
    const supervisorSelect = document.getElementById('newGroupSupervisor');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!nameInput?.value.trim()) return;

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = ' Creando...'; }

    try {
      await createGroup(nameInput.value.trim(), supervisorSelect?.value || null);
      nameInput.value = '';
      if (supervisorSelect) supervisorSelect.value = '';
      await renderAdminPanel();
    } catch (err) {
      console.error('Error creating group:', err);
      alert('Error creando grupo: ' + err.message);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Crear Grupo'; }
    }
  });
}
