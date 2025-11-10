# Testing Checklist for Strategy Changes

## Pre-requisites
- [ ] Plugin built successfully (`npm run build`)
- [ ] Plugin copied to Obsidian vault
- [ ] Test recipes created with varied properties

## Basic Functionality Tests
- [ ] Generate 1-week meal plan successfully
- [ ] Generate 2-week meal plan successfully  
- [ ] All selected recipes appear in meal plan
- [ ] No duplicate recipes on consecutive days
- [ ] Shopping list generates correctly

## Strategy-Specific Tests
- [ ] Check browser console for strategy debug logs
- [ ] Verify family-friendly recipes are preferred when kid meals needed
- [ ] Confirm fallback to regular strategy when no family recipes
- [ ] Test last resort strategy with very few recipes

## Edge Case Tests
- [ ] Generate with only 2-3 recipes for 7 days
- [ ] Generate with all days requiring kid meals
- [ ] Generate with very restrictive time/difficulty constraints
- [ ] Generate with no family-friendly recipes available

## Regression Tests  
- [ ] Swap meals functionality still works
- [ ] Change meal functionality still works
- [ ] Recipe creation still works
- [ ] Settings still save/load correctly

## Performance Tests
- [ ] Generation time is reasonable (< 5 seconds)
- [ ] No memory leaks or console errors
- [ ] Plugin loads/unloads cleanly

## Notes
- Check browser dev tools console (F12) for debug output
- Look for "Used strategy" messages during generation
- Verify meal variety and constraint adherence