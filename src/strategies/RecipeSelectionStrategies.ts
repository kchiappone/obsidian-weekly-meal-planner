
import { Recipe, MealPlannerSettings } from '../types/types';
import { scoreRecipe, meetsConstraints } from '../utils/RecipeUtils';

// =========================
// Recipe Selection Strategies
// =========================

// --- Strategy Interface/Type ---
export type RecipeSelectionStrategy = (
    recipes: Recipe[], // All available recipes
    day: string, // Current day
    settings: MealPlannerSettings, // Plugin settings
    selected: Recipe[], // Recipes already selected for the entire plan
    isKidMeal: boolean, // Whether this is a kid meal selection
    currentWeekKidMeals?: Recipe[] // Additional context for kid meals
) => Recipe | undefined;

// Helper: Select the best recipe from a pool
function selectBestRecipe(pool: Recipe[], alreadySelected: Recipe[]): Recipe | undefined {
    if (pool.length === 0) return undefined;

    // Shuffle the pool to randomize eligible recipes for each day
    const shuffledPool = pool.slice();
    for (let i = shuffledPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
    }

    const scored = shuffledPool.map(recipe => ({
        recipe,
        // Score against ALL selected recipes to avoid ingredient overlap
        score: scoreRecipe(recipe, alreadySelected)
    }));
    scored.sort((a, b) => b.score - a.score);

    // Find all recipes with the top score
    const topScore = scored[0].score;
    const topRecipes = scored.filter(r => r.score === topScore);
    // Randomly pick one among the top-scoring recipes
    const chosen = topRecipes[Math.floor(Math.random() * topRecipes.length)].recipe;
    return chosen;
}

// --- Main Meal Strategies ---

// 1. Attempt to find a Family-Friendly meal that meets constraints (for days needing a kid meal)
export const FamilyFriendlyStrategy: RecipeSelectionStrategy = (
    recipes,
    day,
    settings,
    selected,
    isKidMeal
) => {
    // Only apply this strategy if selecting a main meal, a kid meal is needed, AND the skip setting is on
    const dayConstraints = settings.dayConstraints[day];
    if (isKidMeal || !dayConstraints?.needsKidMeal || !settings.skipKidMealIfFamilyFriendly) {
        return undefined;
    }

    const familyRecipes = recipes.filter(r =>
        r.familyFriendly &&
        meetsConstraints(r, day, settings.dayConstraints, false) && // Main meal constraints
        !selected.includes(r)
    );

    return selectBestRecipe(familyRecipes, selected);
};

// 2. Attempt to find any valid Regular meal that meets constraints (excludes kid-only)
export const RegularMealStrategy: RecipeSelectionStrategy = (
    recipes,
    day,
    settings,
    selected,
    isKidMeal
) => {
    // This is the core logic for a main/regular meal.
    const validRecipes = recipes.filter(r => {
        if (!meetsConstraints(r, day, settings.dayConstraints, isKidMeal)) {
            return false;
        }
        if (selected.includes(r)) {
            return false;
        }

        // CRITICAL: Never select kid-only recipes as main meals
        if (!isKidMeal && r.kidFriendly && !r.familyFriendly) {
            return false;
        }

        return true;
    });

    return selectBestRecipe(validRecipes, selected);
};

// 3. Last Resort: Select ANY recipe that hasn't been used yet
export const LastResortStrategy: RecipeSelectionStrategy = (
    recipes,
    day,
    settings,
    selected,
    isKidMeal
) => {
    // Last resort ignores day constraints and kid meal status/constraints
    const remaining = recipes.filter(r => !selected.includes(r));

    // Prefer non-kid-only recipes even in last resort
    const nonKidOnly = remaining.filter(r => !(r.kidFriendly && !r.familyFriendly));
    const poolToUse = nonKidOnly.length > 0 ? nonKidOnly : remaining;

    // Note: Since this is last resort, scoring is done against 'selected' as usual.
    return selectBestRecipe(poolToUse, selected);
};


// --- Kid Meal Strategy ---

// The Kid Meal Strategy combines multiple relaxation steps into one function.
export const KidMealStrategy: RecipeSelectionStrategy = (
    kidFriendlyRecipes, // Pool is pre-filtered to kid-friendly only
    day,
    settings,
    allSelected, // main meals + kid meals already selected
    isKidMeal,
    thisWeekKidMeals = [] // Kid meals for the current week (optional context)
) => {

    // Step 1: Strict - Meets constraints, not used this week (as a kid meal), and not used as a main meal
    let validRecipes = kidFriendlyRecipes.filter(r =>
        meetsConstraints(r, day, settings.dayConstraints, true) &&
        !thisWeekKidMeals.includes(r) &&
        !allSelected.includes(r) // Check against allSelected for overall uniqueness
    );

    // Step 2: Relax 'not used this week' constraint
    if (validRecipes.length === 0) {
        validRecipes = kidFriendlyRecipes.filter(r =>
            meetsConstraints(r, day, settings.dayConstraints, true) &&
            !allSelected.includes(r)
        );
    }

    // Step 3: Relax all constraints
    if (validRecipes.length === 0) {
        validRecipes = kidFriendlyRecipes.filter(r =>
            !allSelected.includes(r)
        );
    }

    // Step 4: Allow ANY kid-friendly recipe (even if used as main meal or another kid meal)
    if (validRecipes.length === 0) {
        // Exclude only the main meal of THIS day if it's family-friendly (to avoid redundancy)
        validRecipes = kidFriendlyRecipes;
    }

    // Select the best from the pool found, scoring against the kid meals already selected this week
    if (validRecipes.length > 0) {
        return selectBestRecipe(validRecipes, thisWeekKidMeals);
    }

    return undefined;
};