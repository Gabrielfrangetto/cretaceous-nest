import { load, enableDevMode, devMode } from './state.js';
import { initHeader } from './ui/header.js';
import { initIncubator } from './ui/incubator.js';
import { initNest } from './ui/nest.js';
import { initInventory } from './ui/inventory.js';
import { initShop } from './ui/shop.js';
import { initTabs } from './ui/tabs.js';
import { initAccount } from './ui/account.js';
import { initGate } from './ui/gate.js';
import { initLanding } from './ui/landing.js';
import { initGuide } from './ui/guide.js';
import { initCloud } from './cloud.js';
import { initWater } from './ui/water.js';
import { initRewards } from './ui/rewards.js';
import { initBreeding } from './ui/breeding.js';
import { initBabyInfo } from './ui/baby-info.js';
import { initWorld } from './ui/world.js';
import { initForge } from './ui/forge.js';

// local dev mode: play without an account on localhost with ?dev (never on the real site)
if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('dev')) enableDevMode();
load();
initHeader();
initIncubator();
initNest();
initInventory();
initShop();
initRewards();
initBreeding();
initBabyInfo();
initWorld();
initForge();
initTabs();   // after the modules above, so every tab's handlers are registered before the first tab opens
initAccount();
initWater();
initLanding();
initGate();
initGuide();
if (!devMode()) initCloud();
