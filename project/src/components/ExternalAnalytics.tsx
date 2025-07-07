import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, Check, Code, Copy, ExternalLink, Globe, BarChart2, Trash2, Edit, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ExternalAnalyticsProps {
  onClose?: () => void;
}

interface AnalyticsScript {
  id?: string;
  name: string;
  script_code: string;
  is_active: boolean;
  platform: string;
  created_at?: string;
}

const PLATFORMS = [
  { id: 'google_analytics', name: 'Google Analytics' },
  { id: 'facebook_pixel', name: 'Facebook Pixel' },
  { id: 'hotjar', name: 'Hotjar' },
  { id: 'microsoft_clarity', name: 'Microsoft Clarity' },
  { id: 'custom', name: 'Custom Script' }
];

const ExternalAnalytics: React.FC<ExternalAnalyticsProps> = ({ onClose }) => {
  const [scripts, setScripts] = useState<AnalyticsScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingScript, setEditingScript] = useState<AnalyticsScript | null>(null);
  const [newScript, setNewScript] = useState<AnalyticsScript>({
    name: '',
    script_code: '',
    is_active: true,
    platform: 'google_analytics'
  });
  const [codeCopied, setCodeCopied] = useState<string | null>(null);

  useEffect(() => {
    loadScripts();
  }, []);

  const loadScripts = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('analytics_scripts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setScripts(data || []);
    } catch (err) {
      console.error('Error loading analytics scripts:', err);
      setError('Erreur lors du chargement des scripts d\'analyse');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      if (!newScript.name || !newScript.script_code) {
        setError('Le nom et le code du script sont requis');
        return;
      }

      if (editingScript) {
        // Update existing script
        const { error } = await supabase
          .from('analytics_scripts')
          .update({
            name: newScript.name,
            script_code: newScript.script_code,
            is_active: newScript.is_active,
            platform: newScript.platform
          })
          .eq('id', editingScript.id);

        if (error) throw error;
        
        setSuccess('Script d\'analyse mis à jour avec succès');
      } else {
        // Create new script
        const { error } = await supabase
          .from('analytics_scripts')
          .insert([{
            name: newScript.name,
            script_code: newScript.script_code,
            is_active: newScript.is_active,
            platform: newScript.platform
          }]);

        if (error) throw error;
        
        setSuccess('Script d\'analyse ajouté avec succès');
      }

      // Reset form and reload scripts
      setNewScript({
        name: '',
        script_code: '',
        is_active: true,
        platform: 'google_analytics'
      });
      setIsCreating(false);
      setEditingScript(null);
      loadScripts();

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      console.error('Error saving analytics script:', err);
      setError('Erreur lors de l\'enregistrement du script d\'analyse');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (script: AnalyticsScript) => {
    setEditingScript(script);
    setNewScript({
      name: script.name,
      script_code: script.script_code,
      is_active: script.is_active,
      platform: script.platform
    });
    setIsCreating(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce script ?')) {
      return;
    }

    try {
      setError(null);
      const { error } = await supabase
        .from('analytics_scripts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setSuccess('Script supprimé avec succès');
      loadScripts();
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      console.error('Error deleting analytics script:', err);
      setError('Erreur lors de la suppression du script');
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      setError(null);
      const { error } = await supabase
        .from('analytics_scripts')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      
      setSuccess(`Script ${!currentStatus ? 'activé' : 'désactivé'} avec succès`);
      loadScripts();
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      console.error('Error toggling script status:', err);
      setError('Erreur lors de la modification du statut du script');
    }
  };

  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCodeCopied(id);
    setTimeout(() => setCodeCopied(null), 2000);
  };

  const getScriptTemplate = (platform: string) => {
    switch (platform) {
      case 'google_analytics':
        return `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-XXXXXXXXXX');
</script>`;
      case 'facebook_pixel':
        return `<!-- Meta Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s) {
    if(f.fbq)return;
    n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;
    n.push=n;
    n.loaded=!0;
    n.version='2.0';
    n.queue=[];
    t=b.createElement(e);
    t.async=!0;
    t.src=v;
    s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  
  fbq('init', 'XXXXXXXXXXXXXXX');
  fbq('track', 'PageView');
</script>
<noscript>
  <img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=XXXXXXXXXXXXXXX&ev=PageView&noscript=1"/>
</noscript>
<!-- End Meta Pixel Code -->`;
      case 'hotjar':
        return `<!-- Hotjar Tracking Code -->
<script>
    (function(h,o,t,j,a,r){
        h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
        h._hjSettings={hjid:XXXXXXX,hjsv:6};
        a=o.getElementsByTagName('head')[0];
        r=o.createElement('script');r.async=1;
        r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
        a.appendChild(r);
    })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
</script>`;
      case 'microsoft_clarity':
        return `<!-- Microsoft Clarity -->
<script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "XXXXXXXXXX");
</script>`;
      default:
        return `<!-- Custom Tracking Script -->
<script>
  // Your custom tracking code here
</script>`;
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'google_analytics':
        return <BarChart2 className="w-5 h-5 text-blue-600" />;
      case 'facebook_pixel':
        return <div className="w-5 h-5 flex items-center justify-center bg-blue-600 text-white rounded-full text-xs font-bold">f</div>;
      case 'hotjar':
        return <div className="w-5 h-5 flex items-center justify-center bg-red-600 text-white rounded-full text-xs font-bold">H</div>;
      case 'microsoft_clarity':
        return <div className="w-5 h-5 flex items-center justify-center bg-green-600 text-white rounded-full text-xs font-bold">M</div>;
      default:
        return <Code className="w-5 h-5 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Intégration d'Outils d'Analyse</h2>

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

      <div className="mb-6">
        <button
          onClick={() => {
            setIsCreating(true);
            setEditingScript(null);
            setNewScript({
              name: '',
              script_code: '',
              is_active: true,
              platform: 'google_analytics'
            });
          }}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Code className="w-4 h-4" />
          Ajouter un script d'analyse
        </button>
      </div>

      {isCreating && (
        <div className="mb-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              {editingScript ? 'Modifier le script' : 'Nouveau script d\'analyse'}
            </h3>
            <button
              onClick={() => {
                setIsCreating(false);
                setEditingScript(null);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du script
              </label>
              <input
                type="text"
                value={newScript.name}
                onChange={(e) => setNewScript(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Ex: Google Analytics, Facebook Pixel, etc."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Plateforme
              </label>
              <select
                value={newScript.platform}
                onChange={(e) => {
                  const platform = e.target.value;
                  setNewScript(prev => ({
                    ...prev,
                    platform,
                    script_code: prev.script_code || getScriptTemplate(platform)
                  }));
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                {PLATFORMS.map(platform => (
                  <option key={platform.id} value={platform.id}>{platform.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code du script
              </label>
              <textarea
                value={newScript.script_code}
                onChange={(e) => setNewScript(prev => ({ ...prev, script_code: e.target.value }))}
                rows={10}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm"
                placeholder="Collez votre code de suivi ici..."
              />
              <p className="mt-1 text-sm text-gray-500">
                Collez le code de suivi fourni par la plateforme d'analyse.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={newScript.is_active}
                onChange={(e) => setNewScript(prev => ({ ...prev, is_active: e.target.checked }))}
                className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">
                Activer ce script
              </label>
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingScript(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !newScript.name || !newScript.script_code}
                className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
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
          </div>
        </div>
      )}

      <div className="space-y-4">
        {scripts.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <Code className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Aucun script d'analyse configuré</p>
            <p className="text-sm text-gray-500 mt-1">
              Ajoutez des scripts pour suivre les performances de votre site
            </p>
          </div>
        ) : (
          scripts.map(script => (
            <div
              key={script.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:border-red-200 transition-colors"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getPlatformIcon(script.platform)}
                  <div>
                    <h3 className="font-medium text-gray-900">{script.name}</h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      script.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {script.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(script.id!, script.is_active)}
                    className={`p-2 rounded-lg ${
                      script.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'
                    }`}
                    title={script.is_active ? 'Désactiver' : 'Activer'}
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleEdit(script)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Modifier"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(script.id!)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Supprimer"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">Code du script</h4>
                  <button
                    onClick={() => handleCopyCode(script.id!, script.script_code)}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    {codeCopied === script.id ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copier
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-xs overflow-x-auto bg-gray-800 text-gray-200 p-4 rounded-lg max-h-40">
                  {script.script_code}
                </pre>
              </div>

              <div className="mt-4 text-xs text-gray-500">
                Ajouté le {new Date(script.created_at!).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Comment fonctionnent les scripts d'analyse
        </h3>
        <p className="text-sm text-blue-600 mb-4">
          Les scripts d'analyse sont automatiquement injectés dans toutes les pages de votre site. 
          Ils permettent de collecter des données sur les visiteurs et leur comportement, 
          afin d'améliorer l'expérience utilisateur et les performances de votre site.
        </p>
        <div className="flex flex-wrap gap-4">
          <a 
            href="https://analytics.google.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-700 hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            Google Analytics
          </a>
          <a 
            href="https://business.facebook.com/events_manager/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-700 hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            Facebook Pixel
          </a>
          <a 
            href="https://www.hotjar.com/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-700 hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            Hotjar
          </a>
        </div>
      </div>
    </div>
  );
};

export default ExternalAnalytics;