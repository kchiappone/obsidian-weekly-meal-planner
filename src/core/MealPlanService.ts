import { App, Notice, TFile } from 'obsidian';
import { Recipe, MealPlannerSettings } from '../types/types';
import { scoreRecipe, meetsConstraints, getRecipeTotalTime, getDayEmoji, getDifficultyEmoji, getCurrentSeason, isRecipeInSeason } from '../utils/RecipeUtils';
import {
    RecipeSelectionStrategy,
    FamilyFriendlyStrategy,
    RegularMealStrategy,
    LastResortStrategy,
    KidMealStrategy
} from '../strategies/RecipeSelectionStrategies';


// =========================
// Meal Plan Generation & Shopping List Logic
// =========================
const mainMealStrategies: RecipeSelectionStrategy[] = [
    FamilyFriendlyStrategy,
    RegularMealStrategy,
    LastResortStrategy,
];

/**
 * Helper regex to match a leading number (integer or decimal) and the remainder of the string.
 * This is used for consolidation and summing quantities.
 * e.g., "2 large eggs" -> Quantity: 2, Descriptor: "large eggs"
 * e.g., "1.5 cups flour" -> Quantity: 1.5, Descriptor: "cups flour"
 */
const QUANTITY_REGEX = /^(\d+\.?\d*)\s*(.*?)$/;

/**
 * Data structure to hold the consolidated shopping list item.
 */
interface ConsolidatedItem {
    quantity: number;
    unitDesc: string; // The part of the string after the number (e.g., "large eggs", "cup flour")
    recipeNames: Set<string>;
}


export function selectRecipes(
    recipes: Recipe[],
    count: number,
    days: string[],
    kidMealIndices: boolean[],
    settings: MealPlannerSettings
): { regularMeals: Recipe[]; kidMeals: Map<number, Recipe> } {
    if (recipes.length === 0) return { regularMeals: [], kidMeals: new Map() };

    // --- Assign main meals to days, enforcing constraints and variety ---
    const selected: Recipe[] = new Array(count).fill(undefined);
    const assignedRecipes = new Set<Recipe>();
    const indicesWithFamilyMeals: Set<number> = new Set();
    const eligiblePools: Recipe[][] = [];
    for (let i = 0; i < count; i++) {
        const dayIndex = i % days.length;
        const day = days[dayIndex];
        let pool: Recipe[] = [];
        for (const strategy of mainMealStrategies) {
            pool = recipes.filter(r =>
                !assignedRecipes.has(r) &&
                meetsConstraints(r, day, settings.dayConstraints, false) &&
                (!r.kidFriendly || r.familyFriendly)
            );
            if (pool.length > 0) break;
        }
        eligiblePools.push(pool);
    }

    // Shuffle assignment order
    const indices = Array.from({ length: count }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    for (const i of indices) {
        const pool = eligiblePools[i].filter(r => !assignedRecipes.has(r));
        const scored = pool.map(recipe => ({
            recipe,
            score: scoreRecipe(recipe, selected.filter(Boolean) as Recipe[])
        }));
        scored.sort((a, b) => b.score - a.score);
        const topScore = scored[0].score;
        const topRecipes = scored.filter(r => r.score === topScore);
    const chosen = topRecipes[Math.floor(Math.random() * topRecipes.length)].recipe;
    selected[i] = chosen;
    if (chosen.familyFriendly) indicesWithFamilyMeals.add(i);
    else if (chosen.kidFriendly && !chosen.familyFriendly && kidMealIndices[i]) indicesWithFamilyMeals.add(i);
    }

    // Fill any unassigned days with any available eligible recipe for that day (relax uniqueness, but still enforce constraints)
    for (let i = 0; i < count; i++) {
        if (!selected[i]) {
            const dayIndex = i % days.length;
            const day = days[dayIndex];
            const pool = recipes.filter(r =>
                meetsConstraints(r, day, settings.dayConstraints, false) &&
                (!r.kidFriendly || r.familyFriendly)
            );
            if (pool.length > 0) {
                const chosen = pool[Math.floor(Math.random() * pool.length)];
                selected[i] = chosen;
                assignedRecipes.add(chosen);
                if (chosen.familyFriendly) indicesWithFamilyMeals.add(i);
                else if (chosen.kidFriendly && !chosen.familyFriendly && kidMealIndices[i]) indicesWithFamilyMeals.add(i);
            }
        }
    }

    // --- END STRICT GLOBAL ASSIGNMENT ---

    // Now generate separate kid's meals where needed (unchanged)
    const kidMeals: Map<number, Recipe> = new Map();
    const kidFriendlyRecipes = recipes.filter(r => r.kidFriendly);

    for (let i = 0; i < count; i++) {
        const dayIndex = i % days.length;
        const day = days[dayIndex];
        const week = Math.floor(i / settings.mealsPerWeek) + 1;

        // Skip logic
        if (!kidMealIndices[i]) continue;
        if (indicesWithFamilyMeals.has(i) && settings.skipKidMealIfFamilyFriendly) continue;
        if (kidFriendlyRecipes.length === 0) break;

        // --- Strategy Execution for Kid Meal ---
        const currentWeekKidMeals: Recipe[] = [];
        const currentWeek = Math.floor(i / settings.mealsPerWeek);
        for (let j = currentWeek * settings.mealsPerWeek; j < (currentWeek + 1) * settings.mealsPerWeek; j++) {
            const meal = kidMeals.get(j);
            if (meal) currentWeekKidMeals.push(meal);
        }

        const kidMeal = KidMealStrategy(
            kidFriendlyRecipes, // The pool is filtered to kid-friendly only
            day,
            settings,
            [...selected.filter(Boolean) as Recipe[], ...currentWeekKidMeals],
            true, // isKidMeal is true
            currentWeekKidMeals // Pass current week's kid meals separately for week constraint logic
        );

        if (kidMeal) {
            kidMeals.set(i, kidMeal);
        }
    }

    return { regularMeals: selected.filter(Boolean) as Recipe[], kidMeals: kidMeals };
}

// --- Meal Plan Generation Function ---

// --- Main meal plan generation entry point ---
export async function generateMealPlan(app: App, settings: MealPlannerSettings, getRecipesFunc: () => Promise<Recipe[]>, updateRecipeLastUsedFunc: (file: TFile) => Promise<void>, filePathOverride?: string): Promise<string | null> {
    // Get all recipes
    const recipes = await getRecipesFunc();
    const count = settings.mealsPerWeek * settings.weeksToGenerate;

    // Kid meal calculation
    const kidMealIndices = new Array(count).fill(false).map((_, i) => {
        const dayIndex = i % settings.daysOfWeek.length;
        const day = settings.daysOfWeek[dayIndex];
        return settings.dayConstraints[day]?.needsKidMeal === true;
    });

    const { regularMeals, kidMeals } = selectRecipes(recipes, count, settings.daysOfWeek, kidMealIndices, settings);

    if (regularMeals.length < count) {
        new Notice(`Could only select ${regularMeals.length} out of ${count} meals. Check your constraints or add more recipes.`);
    }

    // --- Meal Plan Note Content Generation ---
    const date = new Date().toISOString().slice(0, 10);

    let folder = (settings.mealPlanFolderPath || 'Meal Plans').trim();
    // Remove leading/trailing slashes and whitespace
    folder = folder.replace(/^\/+|\/+$/g, '');
    if (!folder) folder = 'Meal Plans';
    // Ensure the folder exists
    const folderObj = app.vault.getAbstractFileByPath(folder);
    if (!folderObj) {
        await app.vault.createFolder(folder);
    }
    const filePath = filePathOverride || `${folder}/Meal Plan - ${date}.md`;
    let content = `---\n`;
    content += `date_generated: ${date}\n`;
    const tags = (settings.mealPlanTags && settings.mealPlanTags.length > 0) ? settings.mealPlanTags : ['meal_plan'];
    content += `tags: [${tags.map((t: string) => t.trim()).filter(Boolean).join(', ')}]\n`;
    content += `---\n`;
    content += `# Weekly Meal Plan (${settings.weeksToGenerate} Weeks)\n\n`;

    // Map recipes to their links for quick access
    const allSelectedRecipes = new Set([...regularMeals, ...Array.from(kidMeals.values())]);

    // --- Meal Schedule Generation (now first section) ---
    content += `## Meal Schedule\n`;
    for (let w = 0; w < settings.weeksToGenerate; w++) {
        const week = w + 1;
        content += `\n### 📅 Week ${week}\n\n`;
        regularMeals.slice(w * settings.mealsPerWeek, (w + 1) * settings.mealsPerWeek).forEach((recipe, index) => {
            const dayIndex = index % settings.daysOfWeek.length;
            const day = settings.daysOfWeek[dayIndex];
            const dayEmoji = getDayEmoji(day, settings);
            const absoluteIndex = w * settings.mealsPerWeek + index;
            content += `- [ ] **${dayEmoji} ${day}** - [[${recipe.file.basename}]]`;
            const kidMeal = kidMeals.get(absoluteIndex);
            if (kidMeal) {
                content += ` & [[${kidMeal.file.basename}]]`;
            }
            const totalTime = getRecipeTotalTime(recipe) + (kidMeal ? getRecipeTotalTime(kidMeal) : 0);
            const difficulty = recipe.difficulty || kidMeal?.difficulty || 'default';
            const difficultyEmoji = getDifficultyEmoji(difficulty, settings);
            content += ` - ⏱️ ${totalTime} min - ${difficultyEmoji} ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;
            content += `\n`;
        });
    }

    // --- Shopping List: Weekly/Daily/Recipe breakdown (now after meal schedule) ---
    if (settings.generateShoppingList) {
        content += '\n---\n';
        content += `# 🛒 Shopping List\n`;
        for (let w = 0; w < settings.weeksToGenerate; w++) {
            const week = w + 1;
            content += `\n## 📅 Week ${week}\n`;
            for (let d = 0; d < settings.mealsPerWeek; d++) {
                const absoluteIndex = w * settings.mealsPerWeek + d;
                const day = settings.daysOfWeek[d % settings.daysOfWeek.length];
                const dayEmoji = getDayEmoji(day, settings);
                content += `\n### ${dayEmoji} ${day}\n`;
                // Main meal
                const recipe = regularMeals[absoluteIndex];
                if (recipe) {
                    let label = `[[${recipe.file.basename}]]`;
                    if (recipe.familyFriendly) label += ' (Family Friendly)';
                    else if (recipe.kidFriendly) label += ' (Kid Friendly)';
                    content += `\n#### ${label}\n`;
                    recipe.ingredients.forEach((ingredient: string) => {
                        content += `- [ ] ${ingredient}\n`;
                    });
                }
                // Kid meal (if any)
                const kidMeal = kidMeals.get(absoluteIndex);
                if (kidMeal) {
                    let label = `[[${kidMeal.file.basename}]]`;
                    if (kidMeal.familyFriendly) label += ' (Family Friendly)';
                    else if (kidMeal.kidFriendly) label += ' (Kid Friendly)';
                    content += `\n#### ${label}\n`;
                    kidMeal.ingredients.forEach((ingredient: string) => {
                        content += `- [ ] ${ingredient}\n`;
                    });
                }
            }
        }
        content += '\n';
    }


    const existingFile = app.vault.getAbstractFileByPath(filePath);
    let finalFile: TFile;
    if (existingFile instanceof TFile) {
        await app.vault.modify(existingFile, content);
        finalFile = existingFile;
    } else {
        finalFile = await app.vault.create(filePath, content);
    }

    // Auto-open the generated file
    if (finalFile) {
        // @ts-ignore
        await app.workspace.getLeaf().openFile(finalFile);
    }

    // We update the lastUsed field on the selected recipes here before returning
    for (const recipe of allSelectedRecipes) {
        await updateRecipeLastUsedFunc(recipe.file);
    }

    return filePath;
}