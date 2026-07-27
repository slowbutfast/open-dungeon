import { showToast } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/screens.js';
import * as MemoryAPI from '../api/memory.js';
import { fetchInventory, fetchOffers, executeTrade as apiExecuteTrade } from '../api/barter.js';

let currentTraderName = null;

export function openBarterModal(traderName) {
  currentTraderName = traderName;
  document.getElementById('barter-modal-title').innerText = `[BARTER: ${traderName}]`;
  loadBarterData();
  openModal('modal-barter');
}

export function closeBarterModal() {
  currentTraderName = null;
  closeModal('modal-barter');
}

async function loadBarterData() {
  // Load player inventory
  try {
    const items = await fetchInventory();
    renderPlayerInventory(items);
  } catch (e) {
    // ignore
  }

  // Load trader offers
  if (currentTraderName) {
    try {
      const offers = await fetchOffers(currentTraderName);
      renderTraderOffers(offers);
    } catch (e) {
      // ignore
    }
  }
}

function renderPlayerInventory(items) {
  const container = document.getElementById('barter-player-inventory');
  container.innerHTML = '';
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="help-text">[INVENTORY EMPTY]</p>';
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'barter-item-card';
    div.innerHTML = `
      <div class="barter-item-name">${item.item_name} (x${item.quantity})</div>
      <div class="barter-item-type">${item.item_type}</div>
    `;
    if (item.description) {
      const desc = document.createElement('div');
      desc.className = 'barter-item-desc';
      desc.innerText = item.description;
      div.appendChild(desc);
    }
    container.appendChild(div);
  });
}

function renderTraderOffers(offers) {
  const container = document.getElementById('barter-trader-offers');
  container.innerHTML = '';
  if (!offers || offers.length === 0) {
    container.innerHTML = '<p class="help-text">[NO OFFERS AVAILABLE]</p>';
    return;
  }
  offers.forEach(offer => {
    const div = document.createElement('div');
    div.className = 'barter-offer-card';
    div.innerHTML = `
      <div class="barter-offer-req">Need: ${offer.required_item}</div>
      <div class="barter-offer-give">Offer: ${offer.offered_item}</div>
      ${offer.description ? `<div class="barter-offer-desc">${offer.description}</div>` : ''}
      <button class="btn btn-primary btn-trade" data-required="${offer.required_item}">Execute Trade</button>
    `;
    div.querySelector('.btn-trade').addEventListener('click', () => {
      executeTrade(offer.required_item, offer.offered_item);
    });
    container.appendChild(div);
  });
}

async function executeTrade(requiredItem, offeredItem) {
  const statusEl = document.getElementById('barter-status');
  statusEl.innerText = 'Executing trade...';

  try {
    const res = await apiExecuteTrade(currentTraderName, requiredItem);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Trade failed' }));
      statusEl.innerText = `Error: ${errData.error}`;
      showToast(`Trade failed: ${errData.error}`, true);
      return;
    }

    statusEl.innerText = 'Trade successful!';
    showToast(`Traded ${requiredItem} for ${offeredItem}!`);

    // Re-render inventory and offers
    loadBarterData();

    // Sync memory sidebar
    MemoryAPI.syncMemoryDetails();
  } catch (err) {
    statusEl.innerText = `Error: ${err.message}`;
    showToast(`Trade error: ${err.message}`, true);
  }
}
