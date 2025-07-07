import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface AnalyticsScript {
  id: string;
  name: string;
  script_code: string;
  is_active: boolean;
  platform: string;
}

const AnalyticsScriptInjector: React.FC = () => {
  const [scripts, setScripts] = useState<AnalyticsScript[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadScripts = async () => {
      try {
        // First try to get from local storage
        const { data, error } = await supabase
          .from('analytics_scripts')
          .select('*')
          .eq('is_active', true);

        if (error) throw error;

        setScripts(data || []);
        setError(null);
      } catch (err) {
        console.error('Error loading analytics scripts:', err);
        setError('Failed to load analytics scripts');
      } finally {
        setLoaded(true);
      }
    };

    loadScripts();
  }, []);

  useEffect(() => {
    if (!loaded || scripts.length === 0) return;

    // Keep track of injected scripts for cleanup
    const injectedScripts: HTMLScriptElement[] = [];

    // Inject each script into the document
    scripts.forEach(script => {
      try {
        // Create a temporary div to parse the HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = script.script_code;

        // Find all script tags
        const scriptTags = tempDiv.getElementsByTagName('script');

        // Handle each script tag
        Array.from(scriptTags).forEach(originalScript => {
          const newScript = document.createElement('script');
          
          // Copy all attributes
          Array.from(originalScript.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
          });
          
          // Handle script content
          if (originalScript.src) {
            newScript.src = originalScript.src;
          } else if (originalScript.textContent) {
            // Use textContent instead of innerHTML to prevent syntax errors
            // Remove HTML comments, CDATA sections, and other XML-like constructs
            let scriptContent = originalScript.textContent
              .replace(/<!--[\s\S]*?-->/g, '') // Remove HTML comments
              .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '') // Remove CDATA sections
              .replace(/<\?[\s\S]*?\?>/g, '') // Remove processing instructions
              .replace(/<\/script>/gi, '<\\/script>') // Escape closing script tags
              .trim();
            
            if (scriptContent) {
              newScript.textContent = scriptContent;
            }
          }
          
          // Add to document and track for cleanup
          document.head.appendChild(newScript);
          injectedScripts.push(newScript);
        });
      } catch (error) {
        console.error(`Error injecting analytics script ${script.name}:`, error);
      }
    });

    // Cleanup function to remove scripts when component unmounts
    return () => {
      injectedScripts.forEach(script => {
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
      });
    };
  }, [scripts, loaded]);

  // This component doesn't render anything visible
  return null;
};

export default AnalyticsScriptInjector;