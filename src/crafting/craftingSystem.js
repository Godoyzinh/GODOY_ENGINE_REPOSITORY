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
    const inputPlan = recipe ? this.createRecipeInputPlan(recipe) : null;

    if (!recipe || !inputPlan || !this.canStoreRecipeOutput(recipe, inputPlan)) {
      return false;
    }

    for (const input of inputPlan) {
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
    const inputPlan = this.createRecipeInputPlan(recipe);

    return Boolean(inputPlan) && this.canStoreRecipeOutput(recipe, inputPlan);
  }

  hasRequiredInputs(recipe) {
    return this.createRecipeInputPlan(recipe) !== null;
  }

  canStoreRecipeOutput(recipe, inputPlan) {
    return this.inventorySystem.canAcceptItem(recipe.output, { plannedRemovals: inputPlan });
  }

  createRecipeInputPlan(recipe) {
    if (!recipe) {
      return null;
    }

    const inputPlan = [];

    for (const input of recipe.inputs) {
      const inputRemovals = this.createInputRemovalPlan(input);

      if (!inputRemovals) {
        return null;
      }

      inputPlan.push(...inputRemovals);
    }

    return inputPlan;
  }

  createInputRemovalPlan(input) {
    let remainingCount = input.count;
    const removals = [];

    for (const option of getInputOptions(input)) {
      const availableCount = this.inventorySystem.getItemCount(option);
      const removalCount = Math.min(remainingCount, availableCount);

      if (removalCount <= 0) {
        continue;
      }

      removals.push({
        itemType: option.itemType,
        itemId: option.itemId,
        count: removalCount,
      });
      remainingCount -= removalCount;

      if (remainingCount <= 0) {
        return removals;
      }
    }

    return null;
  }

  getRecipeDiagnostics(recipeId) {
    const recipe = getRecipe(recipeId);

    if (!recipe) {
      return {
        recipeFound: false,
        requirements: [],
        attemptRequirements: [],
        blockReason: 'Recipe is not registered.',
      };
    }

    const inputPlan = this.createRecipeInputPlan(recipe);
    const hasInputs = inputPlan !== null;
    const canStoreOutput = hasInputs && this.canStoreRecipeOutput(recipe, inputPlan);

    return {
      recipeFound: true,
      requirements: recipe.inputs.map(describeInputRequirement),
      attemptRequirements: recipe.inputs.map((input) => this.describeInputAttempt(input)),
      blockReason: resolveRecipeBlockReason({
        recipe,
        hasInputs,
        canStoreOutput,
      }),
    };
  }

  describeInputAttempt(input) {
    const options = getInputOptions(input);
    const availableCount = options.reduce((count, option) => count + this.inventorySystem.getItemCount(option), 0);

    return {
      label: input.label ?? getItemDisplay(input).name,
      required: input.count,
      available: availableCount,
      satisfied: availableCount >= input.count,
      options: options.map((option) => ({
        itemType: option.itemType,
        itemId: option.itemId,
        name: getItemDisplay(option).name,
        available: this.inventorySystem.getItemCount(option),
      })),
    };
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

function getInputOptions(input) {
  const sourceOptions = input.alternatives?.length ? input.alternatives : [input];

  return sourceOptions.map((option) => ({
    itemType: option.itemType ?? input.itemType,
    itemId: option.itemId ?? input.itemId,
  }));
}

function describeInputRequirement(input) {
  const options = getInputOptions(input);

  return {
    label: input.label ?? getItemDisplay(input).name,
    required: input.count,
    options: options.map((option) => ({
      itemType: option.itemType,
      itemId: option.itemId,
      name: getItemDisplay(option).name,
    })),
  };
}

function resolveRecipeBlockReason({ recipe, hasInputs, canStoreOutput }) {
  if (!hasInputs) {
    return `Missing required ingredients for ${recipe.name}.`;
  }

  if (!canStoreOutput) {
    return `No inventory space for ${getItemDisplay(recipe.output).name}.`;
  }

  return null;
}
