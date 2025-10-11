
import { App, TFile, Notice } from 'obsidian';
import { Recipe, MealPlannerSettings, DayConstraints } from '../types/types';

// =========================
// Utility Functions for Recipes
// =========================

// Convert difficulty string to numeric level
export function getDifficultyLevel(difficulty?: string): number {
    switch (difficulty?.toLowerCase()) {
        case 'easy': return 1;
        case 'medium': return 2;
        case 'hard': return 3;
        default: return 2;
    }
}


// Get emoji for difficulty
export function getDifficultyEmoji(difficulty: string | undefined, settings: MealPlannerSettings): string {
    const key = difficulty?.toLowerCase() || 'default';
    return settings.difficultyEmojis[key] || settings.difficultyEmojis['default'] || '⚪';
}

// Get emoji for day
export function getDayEmoji(day: string, settings: MealPlannerSettings): string {
    const key = day.toLowerCase();
    return settings.dayEmojis[key] || settings.dayEmojis['default'] || '📅';
}

// Calculate total time for a recipe
export function getRecipeTotalTime(recipe: Recipe): number {
    const prep = recipe.prepTime || 0;
    const cook = recipe.cookTime || 0;
    return prep + cook;
}


// Score a recipe for selection (higher is better)
export function scoreRecipe(recipe: Recipe, alreadySelected: Recipe[], currentDayIndex?: number, selectedArray?: Recipe[]): number {
    let score = 100;
    
    // Time-based scoring for previously used recipes
    if (recipe.lastUsed) {
        const daysSinceUsed = (Date.now() - recipe.lastUsed) / (1000 * 60 * 60 * 24);
        score += Math.min(daysSinceUsed * 2, 50);
    } else {
        score += 30; // Bonus for never-used recipes
    }
    
    // Heavy penalty for exact recipe repetition
    const exactMatches = alreadySelected.filter(selected => selected.file.path === recipe.file.path).length;
    if (exactMatches > 0) {
        score -= exactMatches * 100; // Severe penalty for reusing the same recipe
    }
    
    // Ingredient overlap penalty
    const overlapPenalty = alreadySelected.reduce((penalty, selected) => {
        const overlap = recipe.ingredients.filter(ing =>
            selected.ingredients.some(selIng =>
                ing.toLowerCase().includes(selIng.toLowerCase()) ||
                selIng.toLowerCase().includes(ing.toLowerCase())
            )
        ).length;
        return penalty + (overlap * 5);
    }, 0);
    score -= overlapPenalty;
    
    // Enhanced anti-consecutive logic that checks actual adjacent days
    if (typeof currentDayIndex === 'number' && selectedArray) {
        // Check previous day
        const prevDayIndex = currentDayIndex - 1;
        if (prevDayIndex >= 0 && selectedArray[prevDayIndex]) {
            const prevRecipe = selectedArray[prevDayIndex];
            if (prevRecipe.file.path === recipe.file.path) {
                score -= 100; // Heavy penalty for exact same recipe on consecutive days
            } else if (prevRecipe.meal_type && recipe.meal_type && prevRecipe.meal_type === recipe.meal_type) {
                score -= 30; // Penalty for same meal type on consecutive days
            }
        }
        
        // Check next day
        const nextDayIndex = currentDayIndex + 1;
        if (nextDayIndex < selectedArray.length && selectedArray[nextDayIndex]) {
            const nextRecipe = selectedArray[nextDayIndex];
            if (nextRecipe.file.path === recipe.file.path) {
                score -= 100; // Heavy penalty for exact same recipe on consecutive days
            } else if (nextRecipe.meal_type && recipe.meal_type && nextRecipe.meal_type === recipe.meal_type) {
                score -= 30; // Penalty for same meal type on consecutive days
            }
        }
    } else {
        // Fallback to original logic if day index info not available
        if (recipe.meal_type && alreadySelected.length > 0) {
            const lastRecipe = alreadySelected[alreadySelected.length - 1];
            if (lastRecipe.meal_type && lastRecipe.meal_type === recipe.meal_type) {
                score -= 30;
            }
        }
        
        // Additional anti-consecutive penalty based on recipe name similarity
        if (alreadySelected.length > 0) {
            const lastRecipe = alreadySelected[alreadySelected.length - 1];
            if (lastRecipe.name.toLowerCase() === recipe.name.toLowerCase()) {
                score -= 50; // Penalty for same recipe name consecutively
            }
        }
    }
    
    // Difficulty-based scoring adjustments
    if (recipe.difficulty === 'easy') score += 10;
    if (recipe.difficulty === 'hard') score -= 5;
    
    // Add some randomness to break ties, but less than before to make scoring more deterministic
    score += Math.random() * 10;
    
    return score;
}

// Check if a recipe meets the constraints for a given day
export function meetsConstraints(recipe: Recipe, day: string, constraints: Record<string, DayConstraints>, isKidMeal: boolean = false): boolean {
    const dayConstraints = constraints[day];
    if (!dayConstraints) return true;
    if (isKidMeal) {
        // Exclude recipes that are both family and kid friendly from kid-only meals
        if (!recipe.kidFriendly) return false;
        if (recipe.familyFriendly) return false;
    }
    if (!isKidMeal && dayConstraints.needsKidMeal) {
        if (recipe.kidFriendly && !recipe.familyFriendly) return false;
    }
    if (!isKidMeal && dayConstraints.maxTime) {
        const totalTime = getRecipeTotalTime(recipe);
        if (totalTime > 0 && totalTime > dayConstraints.maxTime) return false;
    }
    if (!isKidMeal && dayConstraints.maxDifficulty) {
        const recipeLevel = getDifficultyLevel(recipe.difficulty);
        const maxLevel = getDifficultyLevel(dayConstraints.maxDifficulty);
        if (recipeLevel > maxLevel) return false;
    }
    return true;
}

// Get the current season based on settings
export function getCurrentSeason(settings: MealPlannerSettings): string {
    const month = new Date().getMonth() + 1;
    if (settings.hemisphere === 'northern') {
        if (month >= 3 && month <= 5) return 'spring';
        if (month >= 6 && month <= 8) return 'summer';
        if (month >= 9 && month <= 11) return 'fall';
        return 'winter';
    }
    if (month >= 3 && month <= 5) return 'fall';
    if (month >= 6 && month <= 8) return 'winter';
    if (month >= 9 && month <= 11) return 'spring';
    return 'summer';
}

// Check if a recipe is in season
export function isRecipeInSeason(recipe: Recipe, settings: MealPlannerSettings): boolean {
    if (!recipe.season || recipe.season.length === 0) return true;
    const currentSeason = getCurrentSeason(settings);
    return recipe.season.includes(currentSeason);
}

// Normalize season strings to standard values
export function normalizeSeason(season: string | string[]): string[] {
    const seasons = Array.isArray(season) ? season : [season];
    return seasons.map(s => {
        const normalized = s.toLowerCase().trim();
        if (normalized.includes('spring')) return 'spring';
        if (normalized.includes('summer')) return 'summer';
        if (normalized.includes('fall') || normalized.includes('autumn')) return 'fall';
        if (normalized.includes('winter')) return 'winter';
        return normalized;
    }).filter(s => ['spring', 'summer', 'fall', 'winter'].includes(s));
}

// Extract ingredients from recipe content
export function extractIngredients(content: string): string[] {
    // Allow for optional icon before 'Ingredients' in the section header
    const ingredientSection = content.match(/##(?:\s*\p{Emoji})?\s*Ingredients\n([\s\S]*?)(?=\n##|$)/iu);
    if (!ingredientSection) return [];
    return ingredientSection[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim());
}

// Extract prep or cook time from recipe content
export function extractTime(content: string, type: 'prep' | 'cook'): number | undefined {
    const regex = type === 'prep'
        ? /prep time:?\s*(\d+)/i
        : /cook time:?\s*(\d+)/i;
    const match = content.match(regex);
    return match ? parseInt(match[1]) : undefined;
}

// Extract difficulty from recipe content
export function extractDifficulty(content: string): string | undefined {
    const match = content.match(/difficulty:?\s*(easy|medium|hard)/i);
    return match ? match[1].toLowerCase() : undefined;
}

// Load all recipes from the vault
export async function getRecipes(app: App, settings: MealPlannerSettings): Promise<Recipe[]> {
    const recipes: Recipe[] = [];
    const folder = app.vault.getAbstractFileByPath(settings.recipeFolderPath);
    if (!folder) {
        new Notice(`Recipe folder "${settings.recipeFolderPath}" not found!`);
        return recipes;
    }
    const files = app.vault.getMarkdownFiles().filter(file =>
        file.path.startsWith(settings.recipeFolderPath)
    );
    for (const file of files) {
        const content = await app.vault.read(file);
        const cache = app.metadataCache.getFileCache(file);
        const recipe: Recipe = {
            file,
            name: file.basename,
            tags: cache?.tags?.map(t => t.tag.slice(1)) || [],
            ingredients: extractIngredients(content),
            prepTime: (cache?.frontmatter?.prep_time ?? cache?.frontmatter?.prepTime) || extractTime(content, 'prep'),
            cookTime: (cache?.frontmatter?.cook_time ?? cache?.frontmatter?.cookTime) || extractTime(content, 'cook'),
            difficulty: cache?.frontmatter?.difficulty || extractDifficulty(content),
            lastUsed: cache?.frontmatter?.lastUsed,
            season: cache?.frontmatter?.season ? normalizeSeason(cache?.frontmatter?.season) : undefined,
            kidFriendly: cache?.frontmatter?.kid_friendly || false,
            familyFriendly: cache?.frontmatter?.family_friendly || false,
            meal_type: cache?.frontmatter?.meal_type?.toLowerCase()
        };
        recipes.push(recipe);
    }
    return recipes;
}