import React, { useState, useRef } from 'react';
import { Upload, Download, Loader2, Phone, X, HelpCircle, FileText, Plus, Trash2, Clock, RefreshCw, Gauge, Save, AlertCircle, CheckCircle, XCircle, Settings, Filter, Globe, MapPin, BarChart2, Eye, Info } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import BackButton from '../components/BackButton';
import { 
  validatePhoneNumberComprehensive, 
  batchValidatePhoneNumbers,
  getSupportedCountries,
  getValidationErrorSummary,
  formatPhoneNumberForDisplay,
  exportValidationResults,
  type ValidationResult,
  type WhatsAppValidationResult
} from '../lib/whatsapp-number-checker';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface FilterSettings {
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
  retryDelay: number;
  useCache: boolean;
  skipApiValidation: boolean;
}

const NumberFiltering = () => {
  const [inputNumbers, setInputNumbers] = useState<string[]>([]);
  const [validationResults, setValidationResults] = useState<WhatsAppValidationResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCountryInfo, setShowCountryInfo] = useState(false);
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [validationSummary, setValidationSummary] = useState<any>(null);
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    batchSize: 20,
    delayBetweenBatches: 1000,
    maxRetries: 3,
    retryDelay: 2000,
    useCache: true,
    skipApiValidation: false
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Gestion de l'import des fichiers
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/);
      const phoneNumbers = lines
        .map(line => line.trim())
        .filter(line => line.length > 0);

      setInputNumbers(phoneNumbers);
      setValidationResults([]);
      setValidationSummary(null);
      setError(null);
      setSuccess(null);
    };
    reader.readAsText(file);
  };

  // Lancer le traitement batch amélioré
  const startProcessing = async () => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setSuccess(null);
    setValidationResults([]);
    setValidationSummary(null);
    abortControllerRef.current = new AbortController();

    try {
      console.log('🚀 [NUMBER-FILTERING] Starting enhanced validation process');
      
      const { results, summary } = await batchValidatePhoneNumbers(
        inputNumbers,
        {
          batchSize: filterSettings.batchSize,
          delayBetweenBatches: filterSettings.delayBetweenBatches,
          maxRetries: filterSettings.maxRetries,
          retryDelay: filterSettings.retryDelay,
          useCache: filterSettings.useCache,
          skipApiValidation: filterSettings.skipApiValidation
        },
        (progressData) => {
          setProgress(Math.round((progressData.completed / progressData.total) * 100));
        }
      );

      setValidationResults(results);
      setValidationSummary(summary);
      
      const successMessage = `✅ Validation completed! ${summary.whatsAppValid} valid WhatsApp numbers found out of ${summary.total} processed. Pre-validation: ${summary.preValidationPassed}/${summary.total} passed format checks.`;
      setSuccess(successMessage);
      console.log('✅ [NUMBER-FILTERING] Validation completed:', summary);
      
      setTimeout(() => setSuccess(null), 5000);

    } catch (error: any) {
      console.error('❌ [NUMBER-FILTERING] Validation failed:', error);
      setError(`Validation failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProgress(0);
      abortControllerRef.current = null;
    }
  };

  // Export simple TXT des numéros WhatsApp valides
  const exportResults = () => {
    if (validationResults.length === 0) {
      setError('No validation results to export');
      return;
    }

    try {
      const whatsAppValidNumbers = validationResults
        .filter(result => result.hasWhatsApp)
        .map(result => result.phoneNumber)
        .join('\n');

      if (!whatsAppValidNumbers.length) {
        setError('No valid WhatsApp numbers found to export');
        return;
      }

      const blob = new Blob([whatsAppValidNumbers], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp_valid_numbers_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`Exported ${validationResults.filter(r => r.hasWhatsApp).length} valid WhatsApp numbers`);
      setTimeout(() => setSuccess(null), 3000);

    } catch (error) {
      console.error('Export error:', error);
      setError('Failed to export results');
    }
  };

  // Export CSV détaillé
  const exportDetailedResults = () => {
    if (validationResults.length === 0) {
      setError('No validation results to export');
      return;
    }

    try {
      const csvContent = exportValidationResults(validationResults);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `detailed_validation_results_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess('Detailed validation results exported');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Export error:', error);
      setError('Failed to export detailed results');
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProgress(0);
  };

  const removeNumber = (index: number) => {
    setInputNumbers(prev => prev.filter((_, i) => i !== index));
    if (validationResults.length > 0) {
      setValidationResults([]);
      setValidationSummary(null);
    }
  };

  const getStatusIcon = (result: WhatsAppValidationResult) => {
    if (!result.validationDetails.isValid) return <XCircle className="w-4 h-4 text-red-500" />;
    if (result.hasWhatsApp) return <CheckCircle className="w-4 h-4 text-green-500" />;
    return <XCircle className="w-4 h-4 text-orange-500" />;
  };

  const getStatusText = (result: WhatsAppValidationResult) => {
    if (!result.validationDetails.isValid) return 'Format Invalid';
    if (result.hasWhatsApp) return 'WhatsApp ✅';
    return 'No WhatsApp ❌';
  };

  const getStatusColor = (result: WhatsAppValidationResult) => {
    if (!result.validationDetails.isValid) return 'bg-red-50 border-red-200 text-red-700';
    if (result.hasWhatsApp) return 'bg-green-50 border-green-200 text-green-700';
    return 'bg-orange-50 border-orange-200 text-orange-700';
  };

  const supportedCountries = getSupportedCountries();

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <BackButton />
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Enhanced WhatsApp Number Filtering</h1>

        {/* Info Panel */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
