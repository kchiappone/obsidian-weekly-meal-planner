// src/SettingsTab.ts

// src/SettingsTab.ts
import { App, PluginSettingTab, Setting } from 'obsidian';
import RecipeMealPlannerPlugin from '../main';

export class MealPlannerSettingTab extends PluginSettingTab {
	plugin: RecipeMealPlannerPlugin;

	constructor(app: App, plugin: RecipeMealPlannerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// =========================
	// Settings Tab UI for Meal Planner Plugin
	// =========================
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Recipe folder path
		new Setting(containerEl)
			.setName('Recipe folder path')
			.setDesc('Path to folder containing your recipe notes')
			.addText(text =>
				text
					.setPlaceholder('Recipes')
					.setValue(this.plugin.settings.recipeFolderPath)
					.onChange(async value => {
						this.plugin.settings.recipeFolderPath = value;
						await this.plugin.saveSettings();
					})
			);

		// Meal plan folder path
		new Setting(containerEl)
			.setName('Meal plan folder path')
			.setDesc('Path to folder where generated meal plan files are stored')
			.addText(text =>
				text
					.setPlaceholder('Meals')
					.setValue(this.plugin.settings.mealPlanFolderPath || 'Meals')
					.onChange(async value => {
						this.plugin.settings.mealPlanFolderPath = value;
						await this.plugin.saveSettings();
					})
			);

		// Meal plan note tags
		new Setting(containerEl)
			.setName('Meal plan note tags')
			.setDesc('Comma-separated list of tags to include in the frontmatter of generated meal plan notes.')
			.addText(text =>
				text
					.setPlaceholder('meal, weekly, food')
					.setValue((this.plugin.settings.mealPlanTags || ['meal']).join(', '))
					.onChange(async value => {
						this.plugin.settings.mealPlanTags = value.split(',').map(t => t.trim()).filter(Boolean);
						if (this.plugin.settings.mealPlanTags.length === 0) {
							this.plugin.settings.mealPlanTags = ['meal'];
						}
						await this.plugin.saveSettings();
					})
			);

		// Meals per week (dropdown 1-7)
		new Setting(containerEl)
			.setName('Meals per week')
			.setDesc('Number of meals to plan per week')
			.addDropdown(dropdown => {
				for (let i = 1; i <= 7; i++) {
					dropdown.addOption(String(i), String(i));
				}
				dropdown.setValue(String(this.plugin.settings.mealsPerWeek || 7));
				dropdown.onChange(async value => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.mealsPerWeek = num;
						await this.plugin.saveSettings();
					}
				});
			});

		// Weeks to generate (dropdown 1-4)
		new Setting(containerEl)
			.setName('Weeks to generate')
			.setDesc('Number of weeks to include in the meal plan')
			.addDropdown(dropdown => {
				for (let i = 1; i <= 4; i++) {
					dropdown.addOption(String(i), String(i));
				}
				dropdown.setValue(String(this.plugin.settings.weeksToGenerate || 1));
				dropdown.onChange(async value => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.weeksToGenerate = num;
						await this.plugin.saveSettings();
					}
				});
			});

		// Skip kid meal if family friendly toggle
		new Setting(containerEl)
			.setName('Skip kid meal if family friendly')
			.setDesc("Skip the kid's meal is a family-friendly meal is chosen for that day.")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.skipKidMealIfFamilyFriendly)
					.onChange(async value => {
						this.plugin.settings.skipKidMealIfFamilyFriendly = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Generate shopping list')
			.setDesc('Include a shopping list section in the generated meal plan note.')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.generateShoppingList)
					.onChange(async value => {
						this.plugin.settings.generateShoppingList = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Seasonality')
			.setDesc('Only select recipes that are in season for the current time of year.')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.respectSeasons)
					.onChange(async value => {
						this.plugin.settings.respectSeasons = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Hemisphere')
			.setDesc('Set your hemisphere to correctly determine seasons.')
			.addDropdown(dropdown =>
				dropdown
					.addOption('northern', 'Northern')
					.addOption('southern', 'Southern')
					.setValue(this.plugin.settings.hemisphere)
					.onChange(async value => {
						this.plugin.settings.hemisphere = value as 'northern' | 'southern';
						await this.plugin.saveSettings();
					})
			);

		// --- Day Constraints Section ---
		new Setting(containerEl)
			.setName('Daily constraints')
			.setDesc('Set max time, difficulty, and kid meal options for each day of the week.')
			.setHeading();

		const daysContainer = containerEl.createDiv({ cls: 'day-constraints-container' });
		this.plugin.settings.daysOfWeek.forEach(day => {
			const constraints = this.plugin.settings.dayConstraints[day] || {};
			// Shorten day names for mobile friendliness
			const shortDay = day.substring(0, 3); // Mon, Tue, Wed, etc.

			const daySetting = new Setting(daysContainer)
				.setName(shortDay)
				.setClass('day-constraint-setting')
				.addText(text =>
					text
						.setPlaceholder('Max time (minutes)')
						.setValue(constraints.maxTime ? String(constraints.maxTime) : '')
						.onChange(async value => {
							if (!this.plugin.settings.dayConstraints[day]) {
								this.plugin.settings.dayConstraints[day] = {};
							}
							if (value === '') {
								delete this.plugin.settings.dayConstraints[day].maxTime;
							} else {
								const num = parseInt(value);
								if (!isNaN(num) && num > 0) {
									this.plugin.settings.dayConstraints[day].maxTime = num;
								}
							}
							await this.plugin.saveSettings();
						})
				);

			daySetting.addDropdown(dropdown =>
				dropdown
					.addOption('', 'Any')
					.addOption('easy', 'Easy')
					.addOption('medium', 'Easy-Medium')
					.setValue(constraints.maxDifficulty || '')
					.onChange(async value => {
						if (!this.plugin.settings.dayConstraints[day]) {
							this.plugin.settings.dayConstraints[day] = {};
						}
						if (value === '') {
							delete this.plugin.settings.dayConstraints[day].maxDifficulty;
						} else {
							this.plugin.settings.dayConstraints[day].maxDifficulty = value;
						}
						await this.plugin.saveSettings();
					})
			);

			daySetting.addToggle(toggle =>
				toggle
					.setTooltip("Add kid's meal for this day")
					.setValue(constraints.needsKidMeal || false)
					.onChange(async value => {
						if (!this.plugin.settings.dayConstraints[day]) {
							this.plugin.settings.dayConstraints[day] = {};
						}
						this.plugin.settings.dayConstraints[day].needsKidMeal = value;
						if (!value) {
							delete this.plugin.settings.dayConstraints[day].needsKidMeal;
						}
						await this.plugin.saveSettings();
					})
			);
		});

		// Day Emojis
		new Setting(containerEl)
			.setName("Day icons")
			.setDesc("Set custom icons for each day of the week.")
			.setHeading();

		this.plugin.settings.daysOfWeek.forEach(day => {
			// Shorten day names for mobile friendliness
			const shortDay = day.substring(0, 3); // Mon, Tue, Wed, etc.
			
			new Setting(containerEl)
				.setName(shortDay)
				.addText(text =>
					text
						.setPlaceholder('Icon')
						.setValue(this.plugin.settings.dayEmojis[day.toLowerCase()] || '')
						.onChange(async value => {
							this.plugin.settings.dayEmojis[day.toLowerCase()] = value || '';
							await this.plugin.saveSettings();
						})
				);
		});

		// Difficulty Emojis
		new Setting(containerEl)
			.setName("Recipe difficulty level")
			.setDesc("Set custom icons for recipe difficulty levels.")
			.setHeading();

		const difficultyKeys = ['easy', 'medium', 'hard', 'default'];
		difficultyKeys.forEach(level => {
			new Setting(containerEl)
				.setName(level.charAt(0).toUpperCase() + level.slice(1))
				.setDesc(level === 'default' ? 'For unknown difficulty' : ``)
				.addText(text =>
					text
						.setPlaceholder('Icon')
						.setValue(this.plugin.settings.difficultyEmojis[level] || '')
						.onChange(async value => {
							this.plugin.settings.difficultyEmojis[level] = value || '';
							await this.plugin.saveSettings();
						})
				);
		});
	}
}
