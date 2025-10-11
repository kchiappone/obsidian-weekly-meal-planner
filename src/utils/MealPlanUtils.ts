import { App, TFile } from 'obsidian';
import { MealPlannerSettings } from '../types/types';
import { getDayEmoji } from './RecipeUtils';

export interface MealPlanChecklistEntry {
  week: number;
  day: string;
  dayEmoji: string;
  line: string;
  lineIndex: number;
  recipes: string[];
}

/**
 * Parse the current meal plan file and extract all checklist lines with week, day, emoji, and recipes.
 */
export async function extractMealPlanChecklistEntries(app: App, settings: MealPlannerSettings, filePath: string): Promise<MealPlanChecklistEntry[]> {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return [];
  const content = await app.vault.read(file);
  const lines = content.split(/\r?\n/);
  const entries: MealPlanChecklistEntry[] = [];
  let currentWeek = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match both '### Week N' and '### 📅 Week N'
    const weekMatch = line.match(/^### (?:📅 )?Week (\d+)/);
    if (weekMatch) {
      currentWeek = parseInt(weekMatch[1], 10);
      continue;
    }
    // Match checklist line: - [ ] **🌙 Monday** - [[Recipe1]] & [[Recipe2]] ...
    // Even more robust: capture everything up to the last word before '**' as emoji, last word as day
    const checklistMatch = line.match(/^- \[.\] \*\*(.+?)\s([A-Za-z]+)\*\* - (.+)$/u);
    if (checklistMatch) {
      const dayEmoji = checklistMatch[1].trim();
      const day = checklistMatch[2].trim();
      const recipesRaw = checklistMatch[3];
      // Extract all [[RecipeName]]
      const recipes = Array.from(recipesRaw.matchAll(/\[\[([^\]]+)\]\]/g)).map(m => m[1]);
      entries.push({
        week: currentWeek,
        day,
        dayEmoji,
        line,
        lineIndex: i,
        recipes
      });
    }
  }
  return entries;
}
