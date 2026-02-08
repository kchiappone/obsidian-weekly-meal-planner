
import { App, Notice, normalizePath } from 'obsidian';
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
    
    // Rating-based scoring bonus (higher ratings get more points)
    if (recipe.rating !== undefined && recipe.rating !== null) {
        // Give smaller bonus for higher ratings to prevent dominance
        // 5-star: +12 points, 4-star: +9, 3-star: +6, 2-star: +3, 1-star: 0
        const ratingBonus = Math.max(0, (recipe.rating - 1) * 3);
        score += ratingBonus;
    }
    // Note: Unrated recipes get no bonus or penalty, keeping them in the pool
    
    // Frequency penalty within current meal plan - penalize recipes that appear multiple times
    const exactMatches = alreadySelected.filter(selected => selected.file.path === recipe.file.path).length;
    if (exactMatches > 0) {
        // Escalating penalty: 1st repeat = -75, 2nd repeat = -200, 3rd repeat = -400, etc.
        score -= exactMatches * 75 * (exactMatches + 1);
    }
    
    // Additional penalty for recipes appearing in recent selections (even if not exact consecutive days)
    if (typeof currentDayIndex === 'number' && selectedArray) {
        const recentRange = 3; // Check recipes from last 3 days
        for (let checkIndex = Math.max(0, currentDayIndex - recentRange); checkIndex < currentDayIndex; checkIndex++) {
            if (selectedArray[checkIndex] && selectedArray[checkIndex].file.path === recipe.file.path) {
                const dayDistance = currentDayIndex - checkIndex;
                // Stronger penalty for closer days: 1 day = -100, 2 days = -50, 3 days = -25
                score -= Math.max(25, 100 / dayDistance);
            }
        }
    }
    
    // Enhanced recent usage penalty based on lastUsed timestamp
    if (recipe.lastUsed) {
        const daysSinceUsed = (Date.now() - recipe.lastUsed) / (1000 * 60 * 60 * 24);
        if (daysSinceUsed < 7) {
            // Strong penalty for recipes used in the last week
            score -= (7 - daysSinceUsed) * 10;
        } else if (daysSinceUsed < 14) {
            // Moderate penalty for recipes used in the last 2 weeks
            score -= (14 - daysSinceUsed) * 2;
        }
        // After 2+ weeks, give bonus as before
        score += Math.min(daysSinceUsed * 1, 30);
    } else {
        score += 25; // Bonus for never-used recipes (reduced from 30)
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
                return -9999; // Absolutely prevent same recipe on consecutive days
            } else if (prevRecipe.meal_type && recipe.meal_type && prevRecipe.meal_type === recipe.meal_type) {
                score -= 30; // Penalty for same meal type on consecutive days
            }
        }
        
        // Check next day
        const nextDayIndex = currentDayIndex + 1;
        if (nextDayIndex < selectedArray.length && selectedArray[nextDayIndex]) {
            const nextRecipe = selectedArray[nextDayIndex];
            if (nextRecipe.file.path === recipe.file.path) {
                return -9999; // Absolutely prevent same recipe on consecutive days
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
                return -9999; // Absolutely prevent same recipe consecutively
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

// Normalize season strings to standard values
function normalizeSeason(season: string | string[]): string[] {
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
function extractIngredients(content: string): string[] {
    // Allow for optional icon before 'Ingredients' in the section header
    const ingredientSection = content.match(/##(?:\s*\p{Emoji})?\s*Ingredients\n([\s\S]*?)(?=\n##|$)/iu);
    if (!ingredientSection) return [];
    return ingredientSection[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim());
}

// Extract prep or cook time from recipe content
function extractTime(content: string, type: 'prep' | 'cook'): number | undefined {
    const regex = type === 'prep'
        ? /prep time:?\s*(\d+)/i
        : /cook time:?\s*(\d+)/i;
    const match = content.match(regex);
    return match ? parseInt(match[1]) : undefined;
}

// Extract difficulty from recipe content
function extractDifficulty(content: string): string | undefined {
    const match = content.match(/difficulty:?\s*(easy|medium|hard)/i);
    return match ? match[1].toLowerCase() : undefined;
}

// Load all recipes from the vault
export async function getRecipes(app: App, settings: MealPlannerSettings): Promise<Recipe[]> {
    const recipes: Recipe[] = [];
    const normalizedRecipeFolderPath = normalizePath(settings.recipeFolderPath);
    const folder = app.vault.getAbstractFileByPath(normalizedRecipeFolderPath);
    if (!folder) {
        new Notice(`Recipe folder "${settings.recipeFolderPath}" not found!`);
        return recipes;
    }
    const files = app.vault.getMarkdownFiles().filter(file =>
        file.path.startsWith(normalizedRecipeFolderPath)
    );
    for (const file of files) {
        const content = await app.vault.cachedRead(file);
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
            meal_type: cache?.frontmatter?.meal_type?.toLowerCase(),
            rating: cache?.frontmatter?.rating
        };
        
        // Filter by minimum rating if specified
        if (settings.minRating !== undefined) {
            // Include recipe if it's unrated (undefined/null) OR if it meets the minimum rating
            if (recipe.rating !== undefined && recipe.rating < settings.minRating) {
                continue; // Skip this recipe
            }
        }
        
        recipes.push(recipe);
    }
    return recipes;
}