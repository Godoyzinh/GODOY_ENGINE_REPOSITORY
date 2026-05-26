import { getItemDisplay } from '../items/itemRegistry.js';
import { getRecipe, getRecipes } from './recipeRegistry.js';

export class CraftingSystem {
  constructor({ inventorySystem }) {
    this.inventorySystem = inventorySystem;
    this.lastCraftedRecipe = null;
    this.snapshot = this.createSnapshot();
  }

  update() {
    this.snapshot = this.createSnapshot();
  }

  craft(recipeId) {
    const recipe = getRecipe(recipeId);

    if (!recipe || !this.canCraft(recipe)) {
      return false;
    }

    for (const input of recipe.inputs) {
      this.inventorySystem.removeItem(input);
    }

    const wasOutputAdded = this.inventorySystem.addItem(recipe.output);

    if (!wasOutputAdded) {
      return false;
    }

    this.lastCraftedRecipe = recipe.name;
    this.update();

    return true;
  }

  craftFirstAvailable() {
    const recipe = getRecipes().find((candidateRecipe) => this.canCraft(candidateRecipe));

    if (!recipe) {
      return false;
    }

    return this.craft(recipe.id);
  }

  canCraft(recipe) {
    return this.hasRequiredInputs(recipe) &&
      this.inventorySystem.canAcceptItem(recipe.output, { plannedRemovals: recipe.inputs });
  }

  hasRequiredInputs(recipe) {
    return recipe.inputs.every((input) => this.inventorySystem.getItemCount(input) >= input.count);
  }

  createSnapshot() {
    const recipes = getRecipes().map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      canCraft: this.canCraft(recipe),
      outputName: getItemDisplay(recipe.output).name,
    }));

    return {
      recipes,
      craftableCount: recipes.filter((recipe) => recipe.canCraft).length,
      lastCraftedRecipe: this.lastCraftedRecipe,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}
