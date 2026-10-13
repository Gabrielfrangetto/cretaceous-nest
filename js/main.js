import { load } from './state.js';
import { initHeader } from './ui/header.js';
import { initIncubator } from './ui/incubator.js';
import { initNest } from './ui/nest.js';
import { initInventory } from './ui/inventory.js';
import { initShop } from './ui/shop.js';
import { initBackup } from './ui/backup.js';
import { initTabs } from './ui/tabs.js';

load();
initHeader();
initIncubator();
initNest();
initInventory();
initShop();
initBackup();
initTabs();   // last, so every tab's handlers are registered before the first tab opens
