
// src/main.ts
import { App, Plugin, TFile, Notice, normalizePath } from 'obsidian';
import { MealPlannerSettings, DEFAULT_SETTINGS } from './types/types';
import { MealPlannerSettingTab } from './settings/SettingsTab';
import { SwapMealsModal, ChangeMealModal, OverwriteOrNewFileModal } from './modals/Modals';
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

		this.addRibbonIcon('chef-hat', 'Generate Weekly Meal Plan', async () => {
			await this.generateMealPlan();
		});

		this.addCommand({
			id: 'generate-meal-plan',
			name: 'Generate Weekly Meal Plan',
			callback: async () => {
				await this.generateMealPlan();
			}
		});

		this.addCommand({
			id: 'swap-meals',
			name: 'Swap Meals Between Days',
			callback: () => {
				new SwapMealsModal(this.app, this, async (entry1, entry2) => {
					await handleSwapMeals(this.app, this.settings, entry1, entry2);
				}).open();
			}
		});

		this.addCommand({
			id: 'change-meal',
			name: 'Change Meal for a Day',
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
		let folder = (settings.mealPlanFolderPath || 'Meal Plans').trim();
		folder = normalizePath(folder);
		if (!folder) folder = 'Meal Plans';
		const filePath = normalizePath(`${folder}/Meal Plan - ${date}.md`);
		const existingFile = app.vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			new OverwriteOrNewFileModal(
				app,
				filePath,
				async () => {
					// Overwrite
					await coreGenerateMealPlan(app, settings, getRecipesBound, updateRecipeLastUsed);
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
					await coreGenerateMealPlan(app, settings, getRecipesBound, updateRecipeLastUsed, uniqueFilePath);
					settings.mealPlanFolderPath = origFolder;
				}
			).open();
		} else {
			await coreGenerateMealPlan(app, settings, getRecipesBound, updateRecipeLastUsed);
		}
	}

		async updateRecipeLastUsed(file: TFile) {
			const timestamp = Date.now();
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter.lastUsed = timestamp;
			});
		}
}