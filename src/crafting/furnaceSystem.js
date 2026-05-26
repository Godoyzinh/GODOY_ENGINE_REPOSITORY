import { ITEM_IDS, ITEM_TYPES, getFuelDefinition } from '../items/itemRegistry.js';

export const FURNACE_RECIPE_IDS = {
  ironIngot: 'ironIngot',
  cookedBerries: 'cookedBerries',
};

export const FURNACE_RECIPES = {
  [FURNACE_RECIPE_IDS.ironIngot]: {
    id: FURNACE_RECIPE_IDS.ironIngot,
    name: 'Smelt Iron Ingot',
    category: 'smelting',
    duration: 6,
    input: { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.ironOre, count: 1 },
    output: { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.ironIngot, count: 1 },
  },
  [FURNACE_RECIPE_IDS.cookedBerries]: {
    id: FURNACE_RECIPE_IDS.cookedBerries,
    name: 'Cook Berries',
    category: 'cooking',
    duration: 3,
    input: { itemType: ITEM_TYPES.consumable, itemId: ITEM_IDS.berries, count: 2 },
    output: { itemType: ITEM_TYPES.consumable, itemId: ITEM_IDS.cookedBerries, count: 1 },
  },
};

const DEFAULT_FUEL_STACK = { itemType: ITEM_TYPES.resource, itemId: ITEM_IDS.coal, count: 1 };

export class FurnaceSystem {
  constructor({ inventorySystem }) {
    this.inventorySystem = inventorySystem;
    this.activeJobs = [];
    this.completedJobs = 0;
    this.lastEvent = 'Idle';
    this.snapshot = this.createSnapshot();
  }

  update(deltaTime) {
    for (const job of this.activeJobs) {
      job.remainingSeconds = Math.max(0, job.remainingSeconds - deltaTime);
    }

    const completedJobs = this.activeJobs.filter((job) => job.remainingSeconds <= 0);
    this.activeJobs = this.activeJobs.filter((job) => job.remainingSeconds > 0);

    for (const job of completedJobs) {
      this.completeJob(job);
    }

    this.snapshot = this.createSnapshot();
  }

  startFirstAvailable() {
    const recipe = Object.values(FURNACE_RECIPES).find((candidateRecipe) => this.canStartRecipe(candidateRecipe));

    if (!recipe) {
      this.lastEvent = 'No furnace recipe';
      this.snapshot = this.createSnapshot();
      return false;
    }

    return this.startRecipe(recipe.id);
  }

  startRecipe(recipeId, fuelStack = DEFAULT_FUEL_STACK) {
    const recipe = FURNACE_RECIPES[recipeId];

    if (!recipe || !this.canStartRecipe(recipe, fuelStack)) {
      return false;
    }

    this.inventorySystem.removeItem(recipe.input);
    this.inventorySystem.removeItem(fuelStack);
    this.activeJobs.push({
      id: `${recipe.id}:${performance.now()}`,
      recipeId: recipe.id,
      recipeName: recipe.name,
      remainingSeconds: recipe.duration,
      duration: recipe.duration,
      output: recipe.output,
    });
    this.lastEvent = `Started ${recipe.name}`;
    this.snapshot = this.createSnapshot();

    return true;
  }

  canStartRecipe(recipe, fuelStack = DEFAULT_FUEL_STACK) {
    const fuelDefinition = getFuelDefinition(fuelStack);

    return Boolean(recipe && fuelDefinition) &&
      this.inventorySystem.getItemCount(recipe.input) >= recipe.input.count &&
      this.inventorySystem.getItemCount(fuelStack) >= fuelStack.count &&
      this.inventorySystem.canAcceptItem(recipe.output, { plannedRemovals: [recipe.input, fuelStack] });
  }

  completeJob(job) {
    const wasAdded = this.inventorySystem.addItem(job.output);

    if (wasAdded) {
      this.completedJobs += 1;
      this.lastEvent = `Completed ${job.recipeName}`;
    } else {
      this.lastEvent = `Output blocked ${job.recipeName}`;
    }
  }

  createSnapshot() {
    const recipes = Object.values(FURNACE_RECIPES).map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      canStart: this.canStartRecipe(recipe),
    }));

    return {
      activeJobs: this.activeJobs.length,
      completedJobs: this.completedJobs,
      nextCompletionSeconds: this.activeJobs[0]?.remainingSeconds ?? 0,
      availableRecipes: recipes.filter((recipe) => recipe.canStart).length,
      recipes,
      lastEvent: this.lastEvent,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}
