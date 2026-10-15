import { load } from './state.js';
import { initHeader } from './ui/header.js';
import { initIncubator } from './ui/incubator.js';
import { initNest } from './ui/nest.js';
import { initInventory } from './ui/inventory.js';
import { initShop } from './ui/shop.js';
import { initBackup } from './ui/backup.js';
import { initTabs } from './ui/tabs.js';
import { initAccount } from './ui/account.js';
import { initCloud } from './cloud.js';
import { initWater } from './ui/water.js';
import { initRewards } from './ui/rewards.js';
import { initBreeding } from './ui/breeding.js';
import { initBabyInfo } from './ui/baby-info.js';
import { initWorld } from './ui/world.js';
import { initForge } from './ui/forge.js';

load();
initHeader();
initIncubator();
initNest();
initInventory();
initShop();
initBackup();
initRewards();
initBreeding();
initBabyInfo();
initWorld();
initForge();
initTabs();   // after the modules above, so every tab's handlers are registered before the first tab opens
initAccount();
initWater();
initCloud();  // loads the account SDK only when js/cloud-config.js is filled in
