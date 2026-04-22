import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface VoiceCommand {
  command: string;
  patterns: string[];
  action: (params?: any) => void;
}

interface UseVoiceCommandsReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  error: string | null;
}

export function useVoiceCommands(commands: VoiceCommand[]): UseVoiceCommandsReturn {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = getLanguageCode(language);

      recognition.onresult = (event: any) => {
        const result = event.results[0][0].transcript.toLowerCase();
        setTranscript(result);
        processCommand(result);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setError(event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [language, commands]);

  const getLanguageCode = (lang: string): string => {
    const codes: Record<string, string> = {
      en: 'en-US',
      fr: 'fr-FR',
    };
    return codes[lang] || 'en-US';
  };

  const processCommand = useCallback((text: string) => {
    for (const cmd of commands) {
      for (const pattern of cmd.patterns) {
        const regex = new RegExp(pattern, 'i');
        const match = text.match(regex);

        if (match) {
          const params = extractParams(text, pattern);
          cmd.action(params);
          return;
        }
      }
    }
  }, [commands]);

  const extractParams = (text: string, pattern: string): any => {
    const numberMatch = text.match(/\d+/);
    const params: any = {};

    if (numberMatch) {
      params.number = parseInt(numberMatch[0]);
    }

    if (text.includes('egg') || text.includes('mayai') || text.includes('œuf')) {
      params.type = 'eggs';
    }
    if (text.includes('feed') || text.includes('chakula') || text.includes('aliment')) {
      params.type = 'feed';
    }
    if (text.includes('dead') || text.includes('mortality') || text.includes('vifo')) {
      params.type = 'mortality';
    }

    return params;
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setError(null);
      setTranscript('');
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Error starting recognition:', err);
        setError('Failed to start voice recognition');
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  return {
    isListening,
    isSupported,
    transcript,
    startListening,
    stopListening,
    error
  };
}
