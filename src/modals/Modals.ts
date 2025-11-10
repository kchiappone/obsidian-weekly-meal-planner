// src/Modals.ts
import { App, Modal, Setting } from 'obsidian';
import RecipeMealPlannerPlugin from '../main';
import { extractMealPlanChecklistEntries, MealPlanChecklistEntry } from '../utils/MealPlanUtils';
import { Recipe } from '../types/types';

export class SwapMealsModal extends Modal {
	plugin: RecipeMealPlannerPlugin;
	onSubmit: (entry1: MealPlanChecklistEntry, entry2: MealPlanChecklistEntry) => void;

	constructor(app: App, plugin: RecipeMealPlannerPlugin, onSubmit: (entry1: MealPlanChecklistEntry, entry2: MealPlanChecklistEntry) => void) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Swap meals between days' });

		// Load all checklist entries from the current meal plan
		const mealPlanPath = this.plugin.settings.currentMealPlanPath;
		if (!mealPlanPath) {
			contentEl.createEl('div', { text: 'No active meal plan found.' });
			return;
		}
		const entries: MealPlanChecklistEntry[] = await extractMealPlanChecklistEntries(this.app, this.plugin.settings, mealPlanPath);
		if (entries.length < 2) {
			contentEl.createEl('div', { text: 'Not enough meals to swap.' });
			return;
		}

		let selectedEntry1 = entries[0];
		let selectedEntry2 = entries[1];

		new Setting(contentEl)
			.setName('Meal #1')
			.addDropdown(dropdown => {
				entries.forEach((entry, idx) => {
					const label = `Week ${entry.week} - ${entry.day}: ${entry.recipes.join(' & ')}`;
					dropdown.addOption(idx.toString(), label);
				});
				dropdown.onChange(value => {
					selectedEntry1 = entries[parseInt(value, 10)];
				});
				dropdown.setValue('0');
			});

		new Setting(contentEl)
			.setName('Meal #2')
			.addDropdown(dropdown => {
				entries.forEach((entry, idx) => {
					const label = `Week ${entry.week} - ${entry.day}: ${entry.recipes.join(' & ')}`;
					dropdown.addOption(idx.toString(), label);
				});
				dropdown.onChange(value => {
					selectedEntry2 = entries[parseInt(value, 10)];
				});
				dropdown.setValue('1');
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Swap')
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(selectedEntry1, selectedEntry2);
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Modal to prompt for adding a kid meal if needed
    export class KidMealPromptModal extends Modal {
    plugin: RecipeMealPlannerPlugin;
    kidMeals: Recipe[];
    onSubmit: (kidMealName: string | null) => void;
    constructor(app: App, plugin: RecipeMealPlannerPlugin, kidMeals: Recipe[], onSubmit: (kidMealName: string | null) => void) {
        super(app);
        this.plugin = plugin;
        this.kidMeals = kidMeals;
        this.onSubmit = onSubmit;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Add a kid\'s meal?' });
        contentEl.createEl('div', { text: 'The selected recipe is not family or kid friendly, but this day requires a kid meal. Would you like to add one?' });
        let selectedKidMeal = this.kidMeals.length > 0 ? this.kidMeals[0].name : null;
        if (this.kidMeals.length > 0) {
            new Setting(contentEl)
                .setName('Select kid meal')
                .addDropdown(dropdown => {
                    this.kidMeals.forEach(recipe => {
                        dropdown.addOption(recipe.name, recipe.name);
                    });
                    dropdown.onChange(value => selectedKidMeal = value);
                    dropdown.setValue(selectedKidMeal || '');
                });
        }
        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Add kid\'s meal').setCta().onClick(() => {
                this.close();
                this.onSubmit(selectedKidMeal);
            }))
            .addExtraButton(btn => btn.setIcon('cross').setTooltip('No kid meal').onClick(() => {
                this.close();
                this.onSubmit(null);
            }));
    }
    onClose() {
        this.contentEl.empty();
    }
}

export class ChangeMealModal extends Modal {
    plugin: RecipeMealPlannerPlugin;
    onSubmit: (week: number, day: string, recipeName: string, originalChecklistLine: string, kidMealName?: string | null) => void;

    constructor(app: App, plugin: RecipeMealPlannerPlugin, onSubmit: (week: number, day: string, recipeName: string, originalChecklistLine: string, kidMealName?: string | null) => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Change meal' });

        // Load all checklist entries from the current meal plan
        const mealPlanPath = this.plugin.settings.currentMealPlanPath;
        if (!mealPlanPath) {
            contentEl.createEl('div', { text: 'No active meal plan found.' });
            return;
        }
        const entries: MealPlanChecklistEntry[] = await extractMealPlanChecklistEntries(this.app, this.plugin.settings, mealPlanPath);
        if (entries.length === 0) {
            contentEl.createEl('div', { text: 'No meals found in the current meal plan.' });
            return;
        }

        let selectedEntry = entries[0];
        let selectedRecipe = '';
        let selectedChecklistLine = entries[0].line;

        // Load recipes and sort alphabetically by name
    const recipes = (await this.plugin.getRecipesBound()).slice().sort((a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name));

        new Setting(contentEl)
            .setName('Select meal to change')
            .addDropdown(dropdown => {
                entries.forEach((entry, idx) => {
                    const label = `Week ${entry.week} - ${entry.day}: ${entry.recipes.join(' & ')}`;
                    dropdown.addOption(idx.toString(), label);
                });
                dropdown.onChange(value => {
                    selectedEntry = entries[parseInt(value, 10)];
                    selectedChecklistLine = selectedEntry.line;
                });
                dropdown.setValue('0');
            });

        new Setting(contentEl)
            .setName('Select new recipe')
            .addDropdown(dropdown => {
                recipes.forEach((recipe: { name: string }): void => {
                    dropdown.addOption(recipe.name, recipe.name);
                });
                dropdown.onChange(value => selectedRecipe = value);
                if (recipes.length > 0) selectedRecipe = recipes[0].name;
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Change meal')
                .setCta()
                .onClick(() => {
                    // Check if the selected recipe is not family or kid friendly, and the day needs a kid meal
                    const recipe = recipes.find((r: { name: string; familyFriendly?: boolean; kidFriendly?: boolean }): boolean => r.name === selectedRecipe);
                    const dayConstraints = this.plugin.settings.dayConstraints[selectedEntry.day];
                    const needsKidMeal = dayConstraints?.needsKidMeal;
                    const isNotFriendly = recipe && !recipe.familyFriendly && !recipe.kidFriendly;
                    if (needsKidMeal && isNotFriendly) {
                        // Get kid-friendly recipes
                        const kidMeals = recipes.filter((r: { kidFriendly?: boolean; familyFriendly?: boolean }): boolean => !!r.kidFriendly && !r.familyFriendly);
                        new KidMealPromptModal(this.app, this.plugin, kidMeals, (kidMealName) => {
                            this.close();
                            this.onSubmit(selectedEntry.week, selectedEntry.day, selectedRecipe, selectedChecklistLine, kidMealName);
                        }).open();
                    } else {
                        this.close();
                        this.onSubmit(selectedEntry.week, selectedEntry.day, selectedRecipe, selectedChecklistLine);
                    }
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class OverwriteOrNewFileModal extends Modal {
    onOverwrite: () => void | Promise<void>;
    onCreateNew: () => void | Promise<void>;
    filePath: string;
    constructor(app: App, filePath: string, onOverwrite: () => void | Promise<void>, onCreateNew: () => void | Promise<void>) {
        super(app);
        this.filePath = filePath;
        this.onOverwrite = onOverwrite;
        this.onCreateNew = onCreateNew;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Meal plan file exists' });
        contentEl.createEl('div', { text: `A meal plan file already exists at: ${this.filePath}` });
        new Setting(contentEl)
            .addButton(btn => btn.setButtonText('Overwrite').setCta().onClick(() => {
                this.close();
                const result = this.onOverwrite();
                if (result instanceof Promise) {
                    result.catch(console.error);
                }
            }))
            .addButton(btn => btn.setButtonText('Create new').onClick(() => {
                this.close();
                const result = this.onCreateNew();
                if (result instanceof Promise) {
                    result.catch(console.error);
                }
            }))
            .addExtraButton(btn => btn.setIcon('cross').setTooltip('Cancel').onClick(() => {
                this.close();
            }));
    }
    onClose() {
        this.contentEl.empty();
    }
}

export class RecipeNameModal extends Modal {
    onSubmit: (recipeName: string) => void;
    recipeName = '';

    constructor(app: App, onSubmit: (recipeName: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Create new recipe' });

        new Setting(contentEl)
            .setName('Recipe name')
            .setDesc('Enter a name for your new recipe')
            .addText(text => {
                text.setPlaceholder('Spaghetti and meatballs')
                    .setValue(this.recipeName)
                    .onChange(value => {
                        this.recipeName = value;
                    });
                text.inputEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        this.submit();
                    }
                });
                // Focus the input
                setTimeout(() => text.inputEl.focus(), 10);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Create recipe')
                .setCta()
                .onClick(() => this.submit())
            )
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => {
                    this.close();
                    this.onSubmit('');
                })
            );
    }

    submit() {
        if (this.recipeName.trim()) {
            this.close();
            this.onSubmit(this.recipeName.trim());
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}