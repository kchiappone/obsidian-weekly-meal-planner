// Simple test to verify strategy behavior
// Run this with: node test-strategies.js

// Mock the strategies to see if they're being called
const mockStrategies = [
    {
        name: 'FamilyFriendlyStrategy',
        call: (recipes, day, settings, selected, isKidMeal) => {
            console.log(`FamilyFriendlyStrategy called for ${day} with ${recipes.length} recipes`);
            // Return first family-friendly recipe if available
            const familyRecipe = recipes.find(r => r.familyFriendly);
            if (familyRecipe) {
                console.log(`  -> Found family recipe: ${familyRecipe.name}`);
                return familyRecipe;
            }
            console.log(`  -> No family recipes found`);
            return undefined;
        }
    },
    {
        name: 'RegularMealStrategy', 
        call: (recipes, day, settings, selected, isKidMeal) => {
            console.log(`RegularMealStrategy called for ${day} with ${recipes.length} recipes`);
            if (recipes.length > 0) {
                console.log(`  -> Selected regular recipe: ${recipes[0].name}`);
                return recipes[0];
            }
            return undefined;
        }
    }
];

// Mock recipe data
const mockRecipes = [
    { name: 'Pasta', familyFriendly: true, kidFriendly: false },
    { name: 'Chicken Nuggets', familyFriendly: false, kidFriendly: true },
    { name: 'Salad', familyFriendly: false, kidFriendly: false }
];

// Test the strategy selection logic
console.log('Testing strategy selection...\n');

let pool = [];
for (const strategy of mockStrategies) {
    const selectedRecipe = strategy.call(mockRecipes, 'Monday', {}, [], false);
    if (selectedRecipe) {
        pool = [selectedRecipe];
        console.log(`Selected strategy: ${strategy.name} -> ${selectedRecipe.name}\n`);
        break;
    }
}

if (pool.length === 0) {
    console.log('No strategy worked, would fall back to basic filtering\n');
}