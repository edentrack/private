# Translation Guide - Adding New Languages

## Current Structure

The translation system uses a simple object-based approach in `src/utils/simpleTranslations.ts`:

```typescript
export const translations = {
  en: { /* English translations */ },
  fr: { /* French translations */ },
  // Add new languages here
};
```

## How to Add a New Language

### Step 1: Add Language Object
In `src/utils/simpleTranslations.ts`, add a new key to the `translations` object:

```typescript
export const translations = {
  en: { /* ... */ },
  fr: { /* ... */ },
  es: { /* ... */ }, // Spanish example
};
```

### Step 2: Copy English Structure
Copy the entire `en` object structure and translate all values. Keep all keys the same, only translate the values.

### Step 3: Add Language to Language Switcher
Update the language switcher component to include your new language.

## Translation Key Naming Convention

- Use dot notation for nested concepts: `module.submodule.key`
- Examples:
  - `dashboard.title` - Dashboard page title
  - `expenses.category` - Expense category label
  - `common.save` - Common save button
  - `errors.something_went_wrong` - Error messages

## Common Translation Keys

All pages should use these common keys:
- `common.save` - Save button
- `common.cancel` - Cancel button
- `common.update` - Update button
- `common.delete` - Delete button
- `common.edit` - Edit button
- `common.add` - Add button
- `common.loading` - Loading message
- `common.error` - Generic error
- `errors.something_went_wrong` - Something went wrong
- `errors.failed_to_load` - Failed to load
- `errors.failed_to_save` - Failed to save

## Best Practices

1. **Always use translation keys** - Never hardcode strings in components
2. **Use fallback values** - `t('key') || 'Fallback'` for safety
3. **Group related translations** - Use prefixes like `sales.`, `expenses.`, etc.
4. **Keep keys consistent** - Use the same key structure across all languages
5. **Test all languages** - Switch languages and verify all strings translate

## Adding Translations to a Component

```typescript
import { useTranslate } from '../../utils/simpleTranslations';

export function MyComponent() {
  const { t } = useTranslate();
  
  return (
    <div>
      <h1>{t('my_component.title')}</h1>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

## Error Messages

All error messages should be translatable:

```typescript
// ❌ Bad
setError('Something went wrong');

// ✅ Good
setError(t('errors.something_went_wrong'));
```












