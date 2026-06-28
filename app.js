import { initializeFirebase, fetchCollectionDocs } from './firebase.js';

const state = {
  owners: [],
  properties: [],
  rooms: [],
  tenants: [],
  payments: [],
  maintenance: [],
  propertiesMap: {},
  roomsMap: {},
  tenantsMap: {}
};

function setStatus(type, message) {
  const banner = document.getElementById('status-banner');
  if (!banner) return;

  banner.className = `status-banner show ${type}`;
  banner.textContent = message;
}

function updateTimestamp() {
  const now = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const el = document.getElementById('lastUpdate');
  if (el) {
    el.textContent = `Update: ${now}`;
  }
}

function getValue(data, candidates) {
  for (const key of candidates) {
    if (data?.[key] !== undefined && data?.[key] !== null && data?.[key] !== '') {
      return data[key];
    }
  }
  return undefined;
}

function getRelationId(data, candidates) {
  for (const key of candidates) {
    const value = data?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }
  return undefined;
}

function buildRelationMap(items, relationKeys = []) {
  const map = {};

  items.forEach((item) => {
    if (!item) return;

    if (item.id !== undefined && item.id !== null && item.id !== '') {
      map[String(item.id)] = item;
    }

    relationKeys.forEach((key) => {
      const value = getRelationId(item, [key]);
      if (value) {
        map[String(value)] = item;
      }
    });
  });

  return map;
}

function getPropertyName(propertyId) {
  const property = state.propertiesMap?.[propertyId];
  if (property) {
    return getValue(property, ['propertyName', 'nama', 'name', 'title']) || propertyId || '—';
  }

  if (propertyId) {
    console.warn('Property tidak ditemukan', propertyId);
  }

  return propertyId || '—';
}

function getRoomLabel(roomId) {
  const room = state.roomsMap?.[roomId];
  if (room) {
    return getValue(room, ['nama', 'name', 'nomer_kamar', 'nomor_kamar', 'roomNumber', 'number', 'room_no']) || room.id || roomId || '—';
  }

  if (roomId) {
    console.warn('Room tidak ditemukan', roomId);
  }

  return roomId || '—';
}

function getTenantName(tenantId) {
  const tenant = state.tenantsMap?.[tenantId];
  if (tenant) {
    return getValue(tenant, ['nama', 'name']) || tenant.id || tenantId || '—';
  }

  if (tenantId) {
    console.warn('Tenant tidak ditemukan', tenantId);
  }

  return tenantId || '—';
}

function getOwnerName(ownerId) {
  const owner = state.owners.find((item) => String(item.id) === String(ownerId));
  if (owner) {
    return getValue(owner, ['nama', 'name']) || owner.id || ownerId || '—';
  }

  if (ownerId) {
    console.warn('Owner tidak ditemukan', ownerId);
  }

  return ownerId || '—';
}

function getPaymentStatus(payment) {
  return getValue(payment, ['status', 'statuspembayaran', 'paymentStatus']) || 'unpaid';
}

function isPaymentPaid(payment) {
  const normalized = String(getPaymentStatus(payment)).toLowerCase();
  return ['paid', 'lunas', 'dibayar', 'sudah dibayar', 'bayar', 'terbayar'].includes(normalized);
}

function normalizeDate(value) {
  if (!value) return '—';

  if (typeof value.toDate === 'function') {
    return value.toDate().toLocaleDateString('id-ID');
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('id-ID');
}

function formatCurrency(value) {
  if (value === undefined || value === null || value === '') return '—';
  return `Rp ${Number(value).toLocaleString('id-ID')}`;
}

function priorityBadge(priority) {
  const normalized = String(priority || '').toLowerCase();
  const map = {
    high: ['red', '🔴 Tinggi'],
    medium: ['amber', '🟡 Sedang'],
    low: ['green', '🟢 Rendah']
  };
  const [cls, label] = map[normalized] || ['gray', priority || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function statusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  const map = {
    paid: ['green', '✅ Lunas'],
    unpaid: ['red', '⏳ Belum Bayar'],
    open: ['red', '🔓 Open'],
    terbuka: ['red', '🔓 Open'],
    in_progress: ['amber', '🔄 In Progress'],
    inprogress: ['amber', '🔄 In Progress'],
    resolved: ['green', '✔ Resolved'],
    selesai: ['green', '✔ Resolved'],
    tersedia: ['green', 'Tersedia'],
    available: ['green', 'Tersedia'],
    occupied: ['accent', 'Terisi'],
    terisi: ['accent', 'Terisi'],
    maintenance: ['amber', 'Perbaikan'],
    perbaikan: ['amber', 'Perbaikan'],
    pending: ['amber', 'Pending'],
    kosong: ['amber', '🟡 Kosong'],
    empty: ['amber', '🟡 Kosong']
  };
  const [cls, label] = map[normalized] || ['gray', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function emptyRow(cols, message = 'Tidak ada data') {
  return `<tr><td colspan="${cols}"><div class="empty-state"><div class="empty-state-icon">📭</div><p>${message}</p></div></td></tr>`;
}

function renderEmptyState(containerId, title) {
  const el = document.getElementById(containerId);
  if (el) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><p>${title}</p></div>`;
  }
}

function renderPropertiesPage(properties) {
  const el = document.getElementById('properties-list');
  if (!el) return;

  if (!properties.length) {
    renderEmptyState('properties-list', 'Data Firestore kosong.');
    return;
  }

  el.innerHTML = properties.map((property) => {
    const rooms = Array.isArray(property.rooms) ? property.rooms : [];
    const roomsHtml = rooms.length
      ? rooms.map((room) => {
          const roomNumber = getValue(room, ['nomer_kamar', 'nomor_kamar', 'roomNumber', 'number', 'room_no', 'id']);
          const roomStatus = getValue(room, ['status', 'roomStatus']) || 'kosong';
          const roomPrice = getValue(room, ['harga', 'price', 'monthlyPrice']) || 0;
          return `
            <div class="room-chip ${String(roomStatus).toLowerCase() || 'kosong'}">
              <div class="room-number">Kamar ${roomNumber || '—'}</div>
              <div class="room-status">${statusBadge(roomStatus)}</div>
              <div class="room-price">${formatCurrency(roomPrice)}</div>
            </div>`;
        }).join('')
      : '<p style="padding:16px 20px;color:var(--text-3);font-size:13px">Belum ada kamar.</p>';

    const propertyName = getValue(property, ['propertyName', 'nama', 'name', 'title']) || 'Properti';
    const propertyAddress = getValue(property, ['alamat', 'address']) || '—';
    const ownerId = getRelationId(property, ['ownerid', 'owner_id', 'ownerId']);
    const ownerName = getOwnerName(ownerId);
    const facilities = getValue(property, ['facilities', 'fasilities']) || [];
    const facilitiesText = Array.isArray(facilities) ? facilities.join(', ') : String(facilities || '—');

    return `
      <div class="card" style="margin-bottom:20px">
        <div class="card-header section-header">
          <div class="section-title">
            🏠 ${propertyName}
            <span class="section-count">${rooms.length} kamar</span>
          </div>
          <span style="font-size:12px;color:var(--text-3)">${propertyAddress}</span>
        </div>
        <div style="padding:0 20px 12px;color:var(--text-2);font-size:13px;line-height:1.6">
          <div><strong>Owner:</strong> ${ownerName}</div>
          <div><strong>Facilities:</strong> ${facilitiesText}</div>
        </div>
        <div class="rooms-grid">${roomsHtml}</div>
      </div>`;
  }).join('');
}

function renderTenantsOverview(data) {
  const tbody = document.getElementById('table-tenants-overview');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = emptyRow(4, 'Data Firestore kosong.');
    return;
  }

  tbody.innerHTML = data.map((tenant) => {
    const tenantName = getValue(tenant, ['nama', 'name']) || '—';
    const propertyId = getRelationId(tenant, ['propertiid', 'propertyid', 'propertyId', 'property_id']);
    const roomId = getRelationId(tenant, ['roomid', 'roomId', 'room_id']);
    const propertyName = getPropertyName(propertyId);
    const roomLabel = getRoomLabel(roomId);
    const endDate = normalizeDate(getValue(tenant, ['endDate', 'end_date', 'berakhir']));

    return `
      <tr>
        <td><strong>${tenantName}</strong></td>
        <td style="color:var(--text-2)">${propertyName}</td>
        <td class="mono">${roomLabel}</td>
        <td style="color:var(--text-2)">${endDate}</td>
      </tr>`;
  }).join('');
}

function renderTenantsFull(data) {
  const tbody = document.getElementById('table-tenants-full');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = emptyRow(7, 'Data Firestore kosong.');
    return;
  }

  tbody.innerHTML = data.map((tenant) => {
    const tenantName = getValue(tenant, ['nama', 'name']) || '—';
    const identity = getValue(tenant, ['ktp', 'identityNumber', 'nik']) || '—';
    const phone = getValue(tenant, ['nomer', 'phone', 'telepon', 'noTelepon']) || '—';
    const propertyId = getRelationId(tenant, ['propertiid', 'propertyid', 'propertyId', 'property_id']);
    const roomId = getRelationId(tenant, ['roomid', 'roomId', 'room_id']);
    const propertyName = getPropertyName(propertyId);
    const roomLabel = getRoomLabel(roomId);
    const startDate = normalizeDate(getValue(tenant, ['startDate', 'start_date', 'mulai', 'starDate']));
    const endDate = normalizeDate(getValue(tenant, ['endDate', 'end_date', 'berakhir']));

    return `
      <tr>
        <td><strong>${tenantName}</strong></td>
        <td class="mono">${identity}</td>
        <td class="mono">${phone}</td>
        <td>${propertyName}</td>
        <td class="mono">${roomLabel}</td>
        <td>${startDate}</td>
        <td>${endDate}</td>
      </tr>`;
  }).join('');
}

function renderPaymentsOverview(data) {
  const tbody = document.getElementById('table-payments-overview');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="3"><div class="empty-state"><div class="empty-state-icon">🎉</div><p>Semua tagihan sudah lunas!</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = data.map((payment) => {
    const tenantId = getRelationId(payment, ['tenantid', 'tenantId', 'tenant_id']);
    const tenantName = getTenantName(tenantId);
    const monthValue = getValue(payment, ['month', 'bulan', 'periode']) || '—';
    const paymentStatus = getPaymentStatus(payment);

    return `
      <tr>
        <td><strong>${tenantName}</strong></td>
        <td class="mono">${monthValue}</td>
        <td>${statusBadge(paymentStatus)}</td>
      </tr>`;
  }).join('');
}

function renderPaymentsFull(data) {
  const tbody = document.getElementById('table-payments-full');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = emptyRow(3, 'Data Firestore kosong.');
    return;
  }

  tbody.innerHTML = data.map((payment) => {
    const tenantId = getRelationId(payment, ['tenantid', 'tenantId', 'tenant_id']);
    const tenantName = getTenantName(tenantId);
    const monthValue = getValue(payment, ['month', 'bulan', 'periode']) || '—';
    const paymentStatus = getPaymentStatus(payment);

    return `
      <tr>
        <td><strong>${tenantName}</strong></td>
        <td class="mono">${monthValue}</td>
        <td>${statusBadge(paymentStatus)}</td>
      </tr>`;
  }).join('');
}

function renderMaintenanceOverview(data) {
  const tbody = document.getElementById('table-maintenance-overview');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = emptyRow(3, 'Tidak ada permintaan perbaikan.');
    return;
  }

  tbody.innerHTML = data.map((item) => {
    const description = getValue(item, ['deskripsi', 'description', 'title']) || '—';
    const priority = getValue(item, ['prioritas', 'priority']) || 'medium';
    const status = getValue(item, ['status']) || 'open';

    return `
      <tr>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${description}</td>
        <td>${priorityBadge(priority)}</td>
        <td>${statusBadge(status)}</td>
      </tr>`;
  }).join('');
}

function renderMaintenanceFull(data) {
  const tbody = document.getElementById('table-maintenance-full');
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = emptyRow(5, 'Data Firestore kosong.');
    return;
  }

  tbody.innerHTML = data.map((item) => {
    const description = getValue(item, ['deskripsi', 'description', 'title']) || '—';
    const roomId = getRelationId(item, ['roomid', 'rommid', 'roomId', 'room_id']);
    const roomLabel = getRoomLabel(roomId);
    const priority = getValue(item, ['prioritas', 'priority']) || 'medium';
    const status = getValue(item, ['status']) || 'open';
    const createdAt = normalizeDate(getValue(item, ['tanggalpermintaan', 'createdAt', 'created_at', 'created']));

    return `
      <tr>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${description}</td>
        <td class="mono">${roomLabel}</td>
        <td>${priorityBadge(priority)}</td>
        <td>${statusBadge(status)}</td>
        <td style="color:var(--text-2)">${createdAt}</td>
      </tr>`;
  }).join('');
}

window.filterTenants = () => {
  const queryText = document.getElementById('tenantSearch').value.toLowerCase();
  const filtered = state.tenants.filter((tenant) => {
    const name = getValue(tenant, ['nama', 'name']) || '';
    return String(name).toLowerCase().includes(queryText);
  });

  renderTenantsFull(filtered);
  document.getElementById('count-tenants-page').textContent = filtered.length;
};

window.filterPayments = () => {
  const selected = document.getElementById('paymentFilter').value;
  const filtered = selected
    ? state.payments.filter((payment) => {
        const isPaid = isPaymentPaid(payment);
        return selected === 'paid' ? isPaid : !isPaid;
      })
    : state.payments;
  renderPaymentsFull(filtered);
  document.getElementById('count-payments-page').textContent = filtered.length;
};

window.filterMaintenance = () => {
  const selected = document.getElementById('maintenanceFilter').value;
  const filtered = selected ? state.maintenance.filter((item) => String(getValue(item, ['status'])).toLowerCase() === selected) : state.maintenance;
  renderMaintenanceFull(filtered);
  document.getElementById('count-maintenance-page').textContent = filtered.length;
};

window.navigate = (page, button) => {
  document.querySelectorAll('.page').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));

  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) {
    targetPage.classList.add('active');
  }

  if (button) {
    button.classList.add('active');
  }

  const pageTitles = {
    overview: 'Ringkasan',
    properties: 'Properti & Kamar',
    tenants: 'Penyewa',
    payments: 'Pembayaran',
    maintenance: 'Perbaikan'
  };

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) {
    titleEl.textContent = pageTitles[page] || page;
  }
};

async function loadDashboardData() {
  setStatus('loading', 'Menghubungkan ke Firebase...');
  console.log('Memulai pengambilan data Firestore...');

  try {
    const firebase = initializeFirebase();
    if (firebase.error) {
      throw firebase.error;
    }

    const results = await Promise.allSettled([
      fetchCollectionDocs('owners'),
      fetchCollectionDocs('properties'),
      fetchCollectionDocs('tenants'),
      fetchCollectionDocs('payments'),
      fetchCollectionDocs('rooms'),
      fetchCollectionDocs('maintenanceRequests')
    ]);

    const [ownersResult, propertiesResult, tenantsResult, paymentsResult, roomsResult, maintenanceResult] = results;

    if (ownersResult.status === 'fulfilled') {
      console.log('Loading Owner');
      state.owners = ownersResult.value;
      const owner = state.owners[0] || {};
      const ownerName = getValue(owner, ['nama', 'name']) || 'Pemilik';
      document.getElementById('ownerName').textContent = ownerName;
      document.getElementById('ownerInitial').textContent = ownerName.charAt(0).toUpperCase();
      console.log('Owner berhasil dibaca:', ownerName);
    } else {
      console.error('Gagal membaca owners:', ownersResult.reason);
    }

    if (roomsResult.status === 'fulfilled') {
      console.log('Loading Rooms');
      state.rooms = roomsResult.value;
      state.roomsMap = buildRelationMap(state.rooms, ['roomid', 'roomId', 'room_id']);
      console.log('Rooms berhasil dibaca dari collection utama');
    } else {
      console.error('Gagal membaca rooms:', roomsResult.reason);
    }

    if (propertiesResult.status === 'fulfilled') {
      console.log('Loading Property');
      state.properties = propertiesResult.value;
      state.propertiesMap = buildRelationMap(state.properties, ['propertiid', 'propertyid', 'propertyId', 'property_id']);

      for (const property of state.properties) {
        console.log('Loading property', property.id);
        try {
          const roomDocs = await fetchCollectionDocs(`properties/${property.id}/rooms`);
          console.log('Rooms', roomDocs);
          console.log('Room count', roomDocs.length);
          property.rooms = roomDocs;
        } catch (roomError) {
          console.error('Gagal memuat rooms untuk property', property.id, roomError);
          property.rooms = [];
        }
      }

      const propertiesWithRooms = state.properties.map((property) => ({ ...property, rooms: property.rooms || [] }));
      state.rooms = propertiesWithRooms.flatMap((property) => property.rooms || []);
      state.roomsMap = buildRelationMap(state.rooms, ['roomid', 'roomId', 'room_id']);

      const totalRooms = propertiesWithRooms.reduce((sum, property) => sum + (property.rooms?.length || 0), 0);
      const occupied = propertiesWithRooms.reduce((sum, property) => sum + (property.rooms || []).filter((room) => String(getValue(room, ['status'])).toLowerCase() === 'terisi').length, 0);
      const empty = propertiesWithRooms.reduce((sum, property) => sum + (property.rooms || []).filter((room) => String(getValue(room, ['status'])).toLowerCase() === 'kosong').length, 0);
      const maintenanceCount = propertiesWithRooms.reduce((sum, property) => sum + (property.rooms || []).filter((room) => String(getValue(room, ['status'])).toLowerCase() === 'maintenance').length, 0);

      document.getElementById('stat-properties').textContent = propertiesWithRooms.length;
      document.getElementById('stat-properties-sub').textContent = `${totalRooms} kamar · ${empty} kosong`;
      document.getElementById('stat-occupied').textContent = occupied;
      document.getElementById('stat-occupied-sub').textContent = `${empty} kosong · ${maintenanceCount} maintenance`;
      document.getElementById('stat-maintenance').textContent = maintenanceCount;
      document.getElementById('stat-maintenance-sub').textContent = `${maintenanceCount} kamar sedang perbaikan`;

      renderPropertiesPage(propertiesWithRooms);
      console.log('Properti dan kamar berhasil dirender');
    } else {
      console.error('Gagal membaca properties:', propertiesResult.reason);
      renderEmptyState('properties-list', 'Gagal terhubung ke Firebase.');
    }

    if (tenantsResult.status === 'fulfilled') {
      console.log('Loading Tenant');
      state.tenants = tenantsResult.value;
      state.tenantsMap = buildRelationMap(state.tenants, ['tenantid', 'tenantId', 'tenant_id']);

      document.getElementById('count-tenants').textContent = state.tenants.length;
      document.getElementById('count-tenants-page').textContent = state.tenants.length;
      renderTenantsOverview(state.tenants.slice(0, 5));
      renderTenantsFull(state.tenants);
      console.log('Penyewa berhasil dirender');
    } else {
      console.error('Gagal membaca tenants:', tenantsResult.reason);
      renderTenantsOverview([]);
      renderTenantsFull([]);
    }

    if (paymentsResult.status === 'fulfilled') {
      console.log('Loading Payment');
      state.payments = paymentsResult.value;
      const unpaid = state.payments.filter((payment) => !isPaymentPaid(payment));

      document.getElementById('stat-unpaid').textContent = unpaid.length;
      document.getElementById('stat-unpaid-sub').textContent = `dari ${state.payments.length} tagihan`;
      document.getElementById('count-unpaid-ov').textContent = unpaid.length;
      document.getElementById('count-payments-page').textContent = state.payments.length;
      renderPaymentsOverview(unpaid.slice(0, 5));
      renderPaymentsFull(state.payments);
      console.log('Pembayaran berhasil dirender');
    } else {
      console.error('Gagal membaca payments:', paymentsResult.reason);
      renderPaymentsOverview([]);
      renderPaymentsFull([]);
    }

    if (maintenanceResult.status === 'fulfilled') {
      state.maintenance = maintenanceResult.value;
      const openCount = state.maintenance.filter((item) => String(getValue(item, ['status'])).toLowerCase() !== 'resolved' && String(getValue(item, ['status'])).toLowerCase() !== 'selesai').length;

      document.getElementById('stat-maintenance').textContent = openCount;
      document.getElementById('stat-maintenance-sub').textContent = `${state.maintenance.filter((item) => String(getValue(item, ['status'])).toLowerCase() === 'resolved' || String(getValue(item, ['status'])).toLowerCase() === 'selesai').length} sudah selesai`;
      document.getElementById('count-maintenance-ov').textContent = openCount;
      document.getElementById('count-maintenance-page').textContent = state.maintenance.length;
      renderMaintenanceOverview(state.maintenance.slice(0, 5));
      renderMaintenanceFull(state.maintenance);
      console.log('Maintenance berhasil dirender');
    } else {
      console.error('Gagal membaca maintenanceRequests:', maintenanceResult.reason);
      renderMaintenanceOverview([]);
      renderMaintenanceFull([]);
    }

    updateTimestamp();
    setStatus('success', 'Data Firestore berhasil dimuat.');
    console.log('Render selesai');
  } catch (error) {
    console.error('Terjadi error saat memuat data:', error);
    setStatus('error', error?.message || 'Gagal terhubung ke Firebase.');
    renderEmptyState('properties-list', 'Gagal terhubung ke Firebase.');
    renderTenantsOverview([]);
    renderTenantsFull([]);
    renderPaymentsOverview([]);
    renderPaymentsFull([]);
    renderMaintenanceOverview([]);
    renderMaintenanceFull([]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM selesai dimuat. Memulai aplikasi...');
  const initialButton = document.querySelector('.nav-item.active');
  if (initialButton) {
    window.navigate('overview', initialButton);
  }
  loadDashboardData();
});
