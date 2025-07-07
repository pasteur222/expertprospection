import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, Check, Palette, Type, Monitor, Sun, Moon, Zap, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useLanguage } from '../contexts/LanguageContext';

interface AppearanceSettingsProps {
  onClose?: () => void;
}

interface AppearanceSettings {
  id?: string;
  theme_color: string;
  font_size: 'small' | 'normal' | 'large';
  dark_mode: boolean;
  reduced_motion: boolean;
  custom_css?: string;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_SETTINGS: AppearanceSettings = {
  theme_color: 'yellow',
  font_size: 'normal',
  dark_mode: false,
  reduced_motion: false,
  custom_css: ''
};

const THEME_COLORS = [
  { name: 'Yellow (MTN)', value: 'yellow', hex: '#ffcc00' },
  { name: 'Blue', value: 'blue', hex: '#3b82f6' },
  { name: 'Green', value: 'green', hex: '#22c55e' },
  { name: 'Red', value: 'red', hex: '#ef4444' },
  { name: 'Purple', value: 'purple', hex: '#a855f7' }
];

const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({ onClose }) => {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('theme');
  const [originalSettings, setOriginalSettings] = useState<AppearanceSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    // Apply settings to document
    applySettings(settings);
  }, [settings]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if appearance_settings table exists
      const { error: tableCheckError } = await supabase
        .from('appearance_settings')
        .select('id')
        .limit(1);
      
      if (tableCheckError && tableCheckError.code === '42P01') {
        // Table doesn't exist, create it
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS appearance_settings (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            theme_color text NOT NULL DEFAULT 'yellow',
            font_size text NOT NULL DEFAULT 'normal',
            dark_mode boolean DEFAULT false,
            reduced_motion boolean DEFAULT false,
            custom_css text,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );
          
          ALTER TABLE appearance_settings ENABLE ROW LEVEL SECURITY;
          
          CREATE POLICY "Authenticated users can manage appearance settings"
            ON appearance_settings
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
        `;
        
        const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
        
        if (createError) {
          console.error('Error creating appearance_settings table:', createError);
          // Continue with default settings
          setSettings(DEFAULT_SETTINGS);
          setOriginalSettings(DEFAULT_SETTINGS);
          return;
        }
      }

      const { data, error: fetchError } = await supabase
        .from('appearance_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      
      if (data) {
        const loadedSettings = {
          id: data.id,
          theme_color: data.theme_color || DEFAULT_SETTINGS.theme_color,
          font_size: data.font_size || DEFAULT_SETTINGS.font_size,
          dark_mode: data.dark_mode !== undefined ? data.dark_mode : DEFAULT_SETTINGS.dark_mode,
          reduced_motion: data.reduced_motion !== undefined ? data.reduced_motion : DEFAULT_SETTINGS.reduced_motion,
          custom_css: data.custom_css || DEFAULT_SETTINGS.custom_css,
          created_at: data.created_at,
          updated_at: data.updated_at
        };
        setSettings(loadedSettings);
        setOriginalSettings(loadedSettings);
      } else {
        // No settings found, use defaults
        setSettings(DEFAULT_SETTINGS);
        setOriginalSettings(DEFAULT_SETTINGS);
      }
    } catch (err) {
      console.error('Error loading appearance settings:', err);
      setError('Erreur lors du chargement des paramètres d\'apparence');
    } finally {
      setLoading(false);
    }
  };

  const applySettings = (settings: AppearanceSettings) => {
    // Apply theme color
    document.documentElement.setAttribute('data-theme-color', settings.theme_color);
    
    // Apply font size
    document.documentElement.setAttribute('data-font-size', settings.font_size);
    
    // Apply dark mode
    if (settings.dark_mode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Apply reduced motion
    if (settings.reduced_motion) {
      document.documentElement.classList.add('reduced-motion');
    } else {
      document.documentElement.classList.remove('reduced-motion');
    }
    
    // Apply custom CSS if any
    let customStyleElement = document.getElementById('custom-theme-css');
    if (!customStyleElement && settings.custom_css) {
      customStyleElement = document.createElement('style');
      customStyleElement.id = 'custom-theme-css';
      document.head.appendChild(customStyleElement);
    }
    
    if (customStyleElement) {
      customStyleElement.textContent = settings.custom_css || '';
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Prepare data for upsert
      const dataToSave = {
        theme_color: settings.theme_color,
        font_size: settings.font_size,
        dark_mode: settings.dark_mode,
        reduced_motion: settings.reduced_motion,
        custom_css: settings.custom_css,
        updated_at: new Date().toISOString()
      };

      if (settings.id) {
        // Update existing settings
        const { error } = await supabase
          .from('appearance_settings')
          .update(dataToSave)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Insert new settings
        const { data, error } = await supabase
          .from('appearance_settings')
          .insert([dataToSave])
          .select()
          .single();

        if (error) throw error;
        
        // Update settings with the new ID
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      setOriginalSettings({ ...settings });
      setSuccess('Paramètres d\'apparence enregistrés avec succès');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      console.error('Error saving appearance settings:', err);
      setError('Erreur lors de l\'enregistrement des paramètres d\'apparence');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    // Reset to original settings
    setSettings(originalSettings);
  };

  const handleResetToDefaults = () => {
    // Reset to default settings
    setSettings(DEFAULT_SETTINGS);
  };

  const hasChanges = () => {
    return JSON.stringify(settings) !== JSON.stringify(originalSettings);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Paramètres d'Apparence</h2>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <Check className="w-5 h-5 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="theme" className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            <span>Thème</span>
          </TabsTrigger>
          <TabsTrigger value="typography" className="flex items-center gap-2">
            <Type className="w-4 h-4" />
            <span>Typographie</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            <span>Préférences</span>
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            <span>Avancé</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="theme" className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Couleur du Thème</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {THEME_COLORS.map((color) => (
                <div
                  key={color.value}
                  className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${
                    settings.theme_color === color.value
                      ? 'border-yellow-500 bg-yellow-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSettings({ ...settings, theme_color: color.value })}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full"
                      style={{ backgroundColor: color.hex }}
                    ></div>
                    <span className="text-sm font-medium">{color.name}</span>
                  </div>
                  {settings.theme_color === color.value && (
                    <div className="absolute top-2 right-2">
                      <Check className="w-4 h-4 text-yellow-500" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              La couleur du thème sera appliquée à tous les éléments principaux de l'interface.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Mode d'Affichage</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${
                  !settings.dark_mode
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSettings({ ...settings, dark_mode: false })}
              >
                <div className="flex items-center gap-3">
                  <Sun className="w-5 h-5 text-yellow-500" />
                  <span className="text-sm font-medium">Mode Clair</span>
                </div>
                {!settings.dark_mode && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-yellow-500" />
                  </div>
                )}
              </div>

              <div
                className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${
                  settings.dark_mode
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSettings({ ...settings, dark_mode: true })}
              >
                <div className="flex items-center gap-3">
                  <Moon className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-medium">Mode Sombre</span>
                </div>
                {settings.dark_mode && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-yellow-500" />
                  </div>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Le mode sombre réduit la fatigue oculaire dans les environnements peu éclairés.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="typography" className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Taille de Police</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div
                className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${
                  settings.font_size === 'small'
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSettings({ ...settings, font_size: 'small' })}
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-medium">Petite</span>
                  <span className="text-xs">Aa</span>
                </div>
                {settings.font_size === 'small' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-yellow-500" />
                  </div>
                )}
              </div>

              <div
                className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${
                  settings.font_size === 'normal'
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSettings({ ...settings, font_size: 'normal' })}
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-sm font-medium">Normale</span>
                  <span className="text-sm">Aa</span>
                </div>
                {settings.font_size === 'normal' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-yellow-500" />
                  </div>
                )}
              </div>

              <div
                className={`relative rounded-lg border-2 p-4 cursor-pointer transition-all ${
                  settings.font_size === 'large'
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSettings({ ...settings, font_size: 'large' })}
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-base font-medium">Grande</span>
                  <span className="text-base">Aa</span>
                </div>
                {settings.font_size === 'large' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-yellow-500" />
                  </div>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              La taille de police affecte la lisibilité du texte dans toute l'application.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Accessibilité</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="reduced-motion"
                  checked={settings.reduced_motion}
                  onChange={(e) => setSettings({ ...settings, reduced_motion: e.target.checked })}
                  className="h-4 w-4 text-yellow-500 focus:ring-yellow-500 border-gray-300 rounded"
                />
                <div>
                  <label htmlFor="reduced-motion" className="text-sm font-medium text-gray-900">
                    Réduire les animations
                  </label>
                  <p className="text-xs text-gray-500">
                    Désactive ou réduit les animations et les transitions pour améliorer l'accessibilité.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">CSS Personnalisé</h3>
            <textarea
              value={settings.custom_css || ''}
              onChange={(e) => setSettings({ ...settings, custom_css: e.target.value })}
              rows={10}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent font-mono text-sm"
              placeholder="/* Ajoutez votre CSS personnalisé ici */
:root {
  --custom-color: #ffcc00;
}

.sidebar {
  background-color: var(--custom-color);
}"
            />
            <p className="mt-2 text-sm text-gray-500">
              Le CSS personnalisé vous permet de définir des styles spécifiques pour votre marque.
              Utilisez cette option avec précaution car elle peut affecter la mise en page.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Réinitialisation</h3>
            <button
              onClick={handleResetToDefaults}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Réinitialiser aux paramètres par défaut
            </button>
            <p className="mt-2 text-sm text-gray-500">
              Cette action réinitialisera tous les paramètres d'apparence à leurs valeurs par défaut.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 mt-6">
        <button
          onClick={handleReset}
          disabled={!hasChanges() || saving}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Annuler les modifications
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges() || saving}
          className="flex items-center gap-2 px-6 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Enregistrement...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Enregistrer
            </>
          )}
        </button>
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="text-sm font-medium text-blue-800 mb-2">À propos des paramètres d'apparence</h3>
        <p className="text-sm text-blue-600">
          Les paramètres d'apparence vous permettent de personnaliser l'interface utilisateur pour correspondre à votre marque.
          Les modifications s'appliquent à toutes les pages de l'application et sont visibles par tous les utilisateurs.
        </p>
      </div>
    </div>
  );
};

export default AppearanceSettings;