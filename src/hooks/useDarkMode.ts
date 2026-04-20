import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadDarkModePreference();
  }, []);

  const loadDarkModePreference = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from('user_preferences')
        .select('dark_mode')
        .eq('id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading dark mode:', error);
      }

      if (data) {
        setDarkMode(data.dark_mode ?? false);
      } else {
        await supabase
          .from('user_preferences')
          .insert({
            id: user.id,
            dark_mode: false,
          });
      }
    } catch (error) {
      console.error('Error loading dark mode preference:', error);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (!loaded) return;

    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode, loaded]);

  const toggleDarkMode = async () => {
    const newValue = !darkMode;
    setDarkMode(newValue);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('user_preferences')
        .upsert({
          id: user.id,
          dark_mode: newValue,
          updated_at: new Date().toISOString(),
        });
    } catch (error) {
      console.error('Error saving dark mode preference:', error);
    }
  };

  return { darkMode, toggleDarkMode };
}
