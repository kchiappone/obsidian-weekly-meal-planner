
// src/main.ts
import { App, Plugin, TFile, Notice, normalizePath } from 'obsidian';
import { MealPlannerSettings, DEFAULT_SETTINGS } from './types/types';
import { MealPlannerSettingTab } from './settings/SettingsTab';
import { SwapMealsModal, ChangeMealModal, OverwriteOrNewFileModal, RecipeNameModal } from './modals/Modals';
import { getRecipes } from './utils/RecipeUtils';
import { generateMealPlan as coreGenerateMealPlan } from './core/MealPlanService';
import {
	swapMeals as handleSwapMeals,
	changeMealForDay as handleChangeMealForDay
} from './handlers/ActionHandlers';

export default class WeeklyMealPlannerPlugin extends Plugin {
	settings: MealPlannerSettings;

	async onload() {
		await this.loadSettings();

		// Bind utility methods needed by other modules
		const updateRecipeLastUsed = this.updateRecipeLastUsed.bind(this);
		const getRecipesBound = this.getRecipesBound.bind(this);
		const saveSettingsBound = this.saveSettings.bind(this);

		this.addRibbonIcon('chef-hat', 'Generate meal plan', async () => {
			await this.generateMealPlan();
		});

		this.addCommand({
			id: 'generate-meal-plan',
			name: 'Generate meal plan',
			callback: async () => {
				await this.generateMealPlan();
			}
		});

		this.addCommand({
			id: 'swap-meals',
			name: 'Swap meals between days',
			callback: () => {
				new SwapMealsModal(this.app, this, async (entry1, entry2) => {
					await handleSwapMeals(this.app, this.settings, entry1, entry2);
				}).open();
			}
		});

		this.addCommand({
			id: 'change-meal',
			name: 'Change meal for a day',
			callback: () => {
				new ChangeMealModal(
					this.app,
					this,
					async (
						week: number,
						day: string,
						recipeName: string,
						originalChecklistLine: string,
						kidMealName?: string | null
					) => {
						await handleChangeMealForDay(
							this.app,
							this.settings,
							week,
							day,
							recipeName,
							updateRecipeLastUsed,
							originalChecklistLine,
							kidMealName
						);
					}
				).open();
			}
		});

		this.addCommand({
			id: 'create-recipe-template',
			name: 'Create new recipe template',
			callback: async () => {
				await this.createRecipeTemplate();
			}
		});

		this.addSettingTab(new MealPlannerSettingTab(this.app, this));
	}

	// Helper function to bind getRecipes for external use
	getRecipesBound() {
		return getRecipes(this.app, this.settings);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Calls the core generator and updates settings
	async generateMealPlan() {
		const app = this.app;
		const settings = this.settings;
		const getRecipesBound = this.getRecipesBound.bind(this);
		const updateRecipeLastUsed = this.updateRecipeLastUsed.bind(this);
		const date = new Date().toISOString().slice(0, 10);
		let folder = (settings.mealPlanFolderPath || 'Meals').trim();
		folder = normalizePath(folder);
		if (!folder) folder = 'Meals';
		const filePath = normalizePath(`${folder}/Meal Plan - ${date}.md`);
		const existingFile = app.vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			new OverwriteOrNewFileModal(
				app,
				filePath,
				async () => {
					// Overwrite
					const generatedPath = await coreGenerateMealPlan(app, settings, getRecipesBound, updateRecipeLastUsed);
					if (generatedPath) {
						this.settings.currentMealPlanPath = generatedPath;
						await this.saveSettings();
					}
				},
				async () => {
					// Create new file with unique postfix
					const now = new Date();
					const postfix = `_${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
					const uniqueFilePath = normalizePath(`${folder}/Meal Plan - ${date}${postfix}.md`);
					// Patch settings temporarily to use unique file path
					const origFolder = settings.mealPlanFolderPath;
					settings.mealPlanFolderPath = folder;
					// Patch coreGenerateMealPlan to accept a custom file path if needed
					const generatedPath = await coreGenerateMealPlan(app, settings, getRecipesBound, updateRecipeLastUsed, uniqueFilePath);
					settings.mealPlanFolderPath = origFolder;
					if (generatedPath) {
						this.settings.currentMealPlanPath = generatedPath;
						await this.saveSettings();
					}
				}
			).open();
		} else {
			const generatedPath = await coreGenerateMealPlan(app, settings, getRecipesBound, updateRecipeLastUsed);
			if (generatedPath) {
				this.settings.currentMealPlanPath = generatedPath;
				await this.saveSettings();
			}
		}
	}

	async createRecipeTemplate() {
		const recipeName = await this.promptForRecipeName();
		if (!recipeName) return;

		const recipeFolder = this.settings.recipeFolderPath || 'Recipes';
		const recipePath = normalizePath(`${recipeFolder}/${recipeName}.md`);

		// Check if file already exists
		const existingFile = this.app.vault.getAbstractFileByPath(recipePath);
		if (existingFile) {
			new Notice(`Recipe "${recipeName}" already exists!`);
			return;
		}

		// Ensure recipe folder exists
		const folder = this.app.vault.getAbstractFileByPath(recipeFolder);
		if (!folder) {
			await this.app.vault.createFolder(recipeFolder);
		}

		// Create recipe template content
		const template = this.generateRecipeTemplate(recipeName);

		try {
			const file = await this.app.vault.create(recipePath, template);
			// Open the new recipe file
			const leaf = this.app.workspace.getLeaf();
			await leaf.openFile(file);
			new Notice(`Recipe template "${recipeName}" created successfully!`);
		} catch (error) {
			new Notice(`Failed to create recipe: ${error.message}`);
		}
	}

	private async promptForRecipeName(): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new RecipeNameModal(this.app, (recipeName: string) => {
				resolve(recipeName || null);
			});
			modal.open();
		});
	}

	private generateRecipeTemplate(recipeName: string): string {
		const currentDate = new Date().toISOString();
		return `---
tags:
  - recipe
meal_type: 
prep_time: 
cook_time: 
difficulty: easy
family_friendly: false
kid_friendly: false
season: []
lastUsed: 
---

# ${recipeName}

## ⏱️ Quick Info
- 🔪 **Prep Time:** ___ minutes
- 🔥 **Cook Time:** ___ minutes
- 👨‍🍳 **Difficulty:** Easy/Medium/Hard
- 🍽️ **Meal Type:** ___
- 👨‍👩‍👧‍👦 **Family Friendly:** Yes/No
- 👶 **Kid Friendly:** Yes/No

## 🛒 Ingredients
- 
- 
- 

## 👩‍🍳 Instructions
1. 
2. 
3. 

## 📝 Notes


## 💡 Tips
- 
- 

`;
	}

		async updateRecipeLastUsed(file: TFile) {
			const timestamp = Date.now();
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter.lastUsed = timestamp;
			});
		}
}