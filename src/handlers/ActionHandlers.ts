import { App, TFile, Notice } from 'obsidian';
import { Recipe, MealPlannerSettings } from '../types/types';
import { getRecipes, getRecipeTotalTime, getDifficultyEmoji } from '../utils/RecipeUtils';
import { regenerateShoppingList } from '../core/MealPlanService';
export async function changeMealForDay(
    app: App,
    settings: MealPlannerSettings,
    week: number,
    day: string,
    recipeName: string,
    updateRecipeLastUsed: (file: TFile) => Promise<void>,
    originalChecklistLine: string,
    kidMealName?: string | null
) {
    if (!settings.currentMealPlanPath) {
        new Notice('No active meal plan found. Generate a meal plan first.');
        return;
    }

    const file = app.vault.getAbstractFileByPath(settings.currentMealPlanPath);
    if (!(file instanceof TFile)) {
        new Notice('Meal plan file not found.');
        return;
    }

    let content = await app.vault.read(file);

    // Find the new recipe
    const recipes = await getRecipes(app, settings);
    const newRecipe = recipes.find(r => r.name === recipeName);
    if (!newRecipe) {
        new Notice(`Recipe '${recipeName}' not found.`);
        return;
    }

    // Build the new checklist line, preserving the original day/emoji/format
    // Use the same robust regex as extraction: everything up to last word is emoji, last word is day
    const checklistLineMatch = originalChecklistLine.match(/^- \[.\] \*\*(.+?)\s([A-Za-z]+)\*\* - (.+)$/u);
    if (!checklistLineMatch) {
        new Notice('Could not parse the original checklist line.');
        return;
    }
    const dayEmoji = checklistLineMatch[1].trim();
    const targetDay = checklistLineMatch[2].trim();
    let checklistLine = `- [ ] **${dayEmoji} ${targetDay}** - [[${newRecipe.name}]]`;

    // Kid meal logic: use provided kidMealName if present
    let newKidMeal: Recipe | undefined;
    const dayConstraints = settings.dayConstraints[targetDay];
    if (kidMealName) {
        newKidMeal = recipes.find(r => r.name === kidMealName);
        if (newKidMeal) {
            checklistLine += ` & [[${newKidMeal.name}]]`;
        }
    } else if (dayConstraints?.needsKidMeal && settings.skipKidMealIfFamilyFriendly !== true) {
        const kidFriendlyRecipes = recipes.filter(r => r.kidFriendly);
        if (kidFriendlyRecipes.length > 0 && (!newRecipe.familyFriendly || !newRecipe.kidFriendly)) {
            newKidMeal = kidFriendlyRecipes[0]; // Pick the first kid-friendly recipe (could be improved)
            checklistLine += ` & [[${newKidMeal.name}]]`;
        }
    }

    const totalTime = getRecipeTotalTime(newRecipe) + (newKidMeal ? getRecipeTotalTime(newKidMeal) : 0);
    const difficulty = newRecipe.difficulty || newKidMeal?.difficulty || 'default';
    const difficultyEmoji = getDifficultyEmoji(difficulty, settings);
    checklistLine += ` - ⏱️ ${totalTime} min - ${difficultyEmoji} ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;

    // Replace the original checklist line in the whole file
    if (originalChecklistLine && content.includes(originalChecklistLine)) {
        content = content.replace(originalChecklistLine, checklistLine);
    } else {
        // fallback: try to replace in week section as before (now with calendar icon)
        const weekSectionRegex = new RegExp(`### \\ud83d\\udcc5 Week ${week}\\n([\\s\\S]*?)(?=\\n### \\ud83d\\udcc5 Week|$)`, 'i');
        const weekMatch = weekSectionRegex.exec(content);
        if (!weekMatch) {
            new Notice(`Week ${week} not found in the meal plan.`);
            return;
        }
        const weekSection = weekMatch[1];
        const checklistRegex = new RegExp(`(^- \\[.\\] \\*\\*${dayEmoji} ${targetDay}\\*\\* - ).*$`, 'm');
        const newWeekSection = weekSection.replace(checklistRegex, checklistLine);
        content = content.replace(weekSection, newWeekSection);
    }

    await app.vault.process(file, (data) => {
        return content;
    });
    await updateRecipeLastUsed(newRecipe.file);
    if (newKidMeal) {
      await updateRecipeLastUsed(newKidMeal.file);
    }
    
    // Regenerate shopping list if enabled
    if (settings.generateShoppingList) {
        await regenerateShoppingList(app, settings, settings.currentMealPlanPath);
    }
    
    new Notice(`Changed meal for Week ${week}, ${targetDay} to ${recipeName}.`);
}

// Swap two meals by checklist line
export async function swapMeals(
    app: App,
    settings: MealPlannerSettings,
    entry1: { line: string; day: string; week: number },
    entry2: { line: string; day: string; week: number }
) {
    if (!settings.currentMealPlanPath) {
        new Notice('No active meal plan found. Generate a meal plan first.');
        return;
    }
    const file = app.vault.getAbstractFileByPath(settings.currentMealPlanPath);
    if (!(file instanceof TFile)) {
        new Notice('Meal plan file not found.');
        return;
    }
    const content = await app.vault.read(file);
    if (!content.includes(entry1.line) || !content.includes(entry2.line)) {
        new Notice('Could not find one or both selected meals in the meal plan.');
            return;
    }
    // Only swap the recipe/details portion, keeping the day/emoji fixed
    // Regex: - [ ] **<emoji> <day>** - <recipes/details>
    const checklistRegex = /^(- \[.\] \*\*.+?\*\* - )(.*)$/u;
    const match1 = entry1.line.match(checklistRegex);
    const match2 = entry2.line.match(checklistRegex);
    if (!match1 || !match2) {
        new Notice('Could not parse one or both checklist lines for swapping.');
      return;
    }
    const newLine1 = match1[1] + match2[2];
    const newLine2 = match2[1] + match1[2];
    let swappedContent = content.replace(entry1.line, '<<SWAP_PLACEHOLDER_1>>').replace(entry2.line, '<<SWAP_PLACEHOLDER_2>>');
    swappedContent = swappedContent.replace('<<SWAP_PLACEHOLDER_1>>', newLine1).replace('<<SWAP_PLACEHOLDER_2>>', newLine2);
    await app.vault.process(file, (data) => {
        return swappedContent;
    });
    
    // Regenerate shopping list if enabled
    if (settings.generateShoppingList) {
        await regenerateShoppingList(app, settings, settings.currentMealPlanPath);
    }
    
    new Notice(`Swapped meals between '${entry1.day} (Week ${entry1.week})' and '${entry2.day} (Week ${entry2.week})'!`);
}
