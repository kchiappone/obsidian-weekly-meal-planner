// src/types.ts
import { TFile } from 'obsidian';

export interface DayConstraints {
	maxTime?: number;
	maxDifficulty?: string;
	needsKidMeal?: boolean;
}

export interface MealPlannerSettings {
	recipeFolderPath: string;
	mealsPerWeek: number;
	weeksToGenerate: number;
	daysOfWeek: string[];
	respectSeasons: boolean;
	hemisphere: 'northern' | 'southern';
	dayConstraints: Record<string, DayConstraints>;
	currentMealPlanPath?: string;
	mealPlanFolderPath?: string; // Folder to store generated meal plan files
	mealPlanTags?: string[]; // Custom tags for meal plan frontmatter
	skipKidMealIfFamilyFriendly: boolean;
	generateShoppingList: boolean;

    // Emoji customization
	dayEmojis: Record<string, string>; // e.g. { monday: '🌙', ... }
	difficultyEmojis: Record<string, string>; // e.g. { easy: '🟢', medium: '🟡', hard: '🔴', default: '⚪' }
}

export const DEFAULT_SETTINGS: MealPlannerSettings = {
	recipeFolderPath: 'Recipes',
	mealsPerWeek: 7,
	weeksToGenerate: 1,
	daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
	respectSeasons: true,
	hemisphere: 'northern',
	dayConstraints: {},
	skipKidMealIfFamilyFriendly: true,
	generateShoppingList: true,
	mealPlanFolderPath: 'Meal Plans',
	mealPlanTags: ['meal_plan'],
	dayEmojis: {
		monday: '🌙',
		tuesday: '🔥',
		wednesday: '🐪',
		thursday: '⚡',
		friday: '🎉',
		saturday: '🌟',
		sunday: '☀️',
		default: '📅'
	},
	difficultyEmojis: {
		easy: '🟢',
		medium: '🟡',
		hard: '🔴',
		default: '⚪'
	}
}

export interface Recipe {
	file: TFile;
	name: string;
	tags: string[];
	ingredients: string[];
	prepTime?: number;
	cookTime?: number;
	difficulty?: string;
	lastUsed?: number;
	season?: string[];
	kidFriendly?: boolean;
	familyFriendly?: boolean;
	meal_type?: string;
}