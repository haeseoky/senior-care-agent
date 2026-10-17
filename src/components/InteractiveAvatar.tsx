import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, Bot, Settings, Sparkles, X, Key, History, Trash2, Send } from 'lucide-react';
import { medsStore } from '../lib/medsStore';
import { safeGet, safeSet } from '../lib/storage';
import { loadLLMSettings, saveLLMSettings, processUtterance, localFallback, type LLMProvider, type IntentResult } from '../lib/llm';
import { getSpeechRecognition, type SpeechRecognitionLike, type SpeechRecognitionEvent } from '../lib/webSpeech';

interface InteractiveAvatarProps {
  onTriggerSOS?: () => void;
}

export interface ChatMessage {
  id: string;
  sender: 'senior' | 'family' | 'agent';
  senderName: string;
  text: string;
  time: string;
}

const PROVIDER_LABEL: Record<LLMProvider, string> = {
  'glm': 'GLM (ZAI)',
  'gemini-flash': 'Gemini Flash',
  'openai-gpt4o': 'GPT-4o-mini',
};

export default function InteractiveAvatar({ onTriggerSOS }: InteractiveAvatarProps) {
  const [isListening, setIsListening] = useState(false);
  const [avatarState, setAvatarState] = useState<'idle' | 'listening' | 'thinking' | 'speaking' | 'offline'>('idle');
  const [isOffline, setIsOffline] = useState<boolean>(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmTestResult, setLlmTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [responseMsg, setResponseMsg] = useState<string>('어르신, 반갑습니다! 말씀하고 싶으시면 마이크를 누르거나 말씀해 주세요.');
  const [textInput, setTextInput] = useState<string>('');

  const [activeSpeakerRole, setActiveSpeakerRole] = useState<'senior' | 'family'>('senior');
  const [manualSpeaker, setManualSpeaker] = useState<'auto' | 'senior' | 'family'>('auto');
  const [seniorName, setSeniorName] = useState<string>(() => safeGet<string>('senior_care_name', '홍길동'));

  const [chatLogs, setChatLogs] = useState<ChatMessage[]>(() => safeGet<ChatMessage[]>('senior_care_chat_history_v2', [
    { id: '1', sender: 'agent', senderName: '효돌이 AI', text: '어르신, 반갑습니다! 식사는 맛있게 하셨습니까?', time: '오전 09:00' }
  ]));
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // LLM 설정 (기기 내 저장)
  const [provider, setProvider] = useState<LLMProvider>(() => loadLLMSettings().provider);
  const [apiKey, setApiKey] = useState<string>(() => loadLLMSettings().apiKey);
  const [showModelModal, setShowModelModal] = useState<boolean>(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTextRef = useRef<string>('');
  const isSpeakingRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffDelayRef = useRef<number>(1500);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualSpeakerRef = useRef<'auto' | 'senior' | 'family'>('auto');

  useEffect(() => {
    manualSpeakerRef.current = manualSpeaker;
  }, [manualSpeaker]);

  useEffect(() => {
    safeSet('senior_care_name', seniorName);
  }, [seniorName]);

  // 채팅 로그는 최근 200건만 유지 (localStorage 용량 보호)
  useEffect(() => {
    if (chatLogs.length > 200) {
      setChatLogs(prev => prev.slice(0, 200));
    } else {
      safeSet('senior_care_chat_history_v2', chatLogs);
    }
  }, [chatLogs]);

  // ── STT (Web Speech API, 브라우저 미지원 시 텍스트 입력으로 안내) ──
  useEffect(() => {
    const recognition = getSpeechRecognition();
    if (!recognition) return;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ko-KR';

    recognition.onstart = () => {
      setIsListening(true);
      if (!isSpeakingRef.current) setAvatarState('listening');
      finalTextRef.current = '';
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      backoffDelayRef.current = 1500;
      setIsOffline(false);
      if (isSpeakingRef.current) return;
      let currentText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentText += event.results[i][0].transcript;
      }
      if (currentText.trim()) {
        finalTextRef.current = currentText.trim();
        setTranscript(currentText.trim());
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
          }
        }, 1200);
      }
    };

    recognition.onerror = (event: SpeechRecognitionEvent) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.log('Speech recognition error:', event.error);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

      if (!navigator.onLine) {
        setIsOffline(true);
        setAvatarState('offline');
        return;
      }

      setIsOffline(false);
      const capturedText = finalTextRef.current;
      const hadValidResult = Boolean(capturedText && capturedText.trim());

      if (!isSpeakingRef.current) {
        if (hadValidResult) {
          handleUserUtterance(capturedText);
          finalTextRef.current = '';
        } else {
          setAvatarState('idle');
        }
      }

      const currentDelay = hadValidResult ? 1500 : backoffDelayRef.current;
      if (!hadValidResult) {
        backoffDelayRef.current = Math.min(backoffDelayRef.current * 2, 30000);
      } else {
        backoffDelayRef.current = 1500;
      }

      restartTimerRef.current = setTimeout(() => {
        if (!navigator.onLine) {
          setIsOffline(true);
          setAvatarState('offline');
          return;
        }
        if (!isSpeakingRef.current && recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (e) {}
        }
      }, currentDelay);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setAvatarState('offline');
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };

    const handleOnline = () => {
      setIsOffline(false);
      backoffDelayRef.current = 1500;
      if (!isSpeakingRef.current) {
        setAvatarState('idle');
        if (recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (e) {}
        }
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    recognitionRef.current = recognition;
    if (navigator.onLine) {
      try { recognition.start(); } catch (e) {}
    } else {
      setIsOffline(true);
      setAvatarState('offline');
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const saveChatLog = useCallback((sender: 'senior' | 'family' | 'agent', text: string) => {
    const nowTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    let senderName = '효돌이 AI';
    if (sender === 'senior') senderName = `${seniorName} 어르신`;
    if (sender === 'family') senderName = '보호자 (자녀)';
    const newMsg: ChatMessage = { id: Date.now().toString() + Math.random(), sender, senderName, text, time: nowTime };
    setChatLogs(prev => [newMsg, ...prev]);
  }, [seniorName]);

  // ── TTS ──
  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    isSpeakingRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.onstart = () => setAvatarState('speaking');
    const resume = () => {
      setAvatarState(navigator.onLine ? 'idle' : 'offline');
      setTimeout(() => {
        isSpeakingRef.current = false;
        if (navigator.onLine && recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (e) {}
        }
      }, 1000);
    };
    utterance.onend = resume;
    utterance.onerror = resume;
    window.speechSynthesis.speak(utterance);
  }, []);

  // ── LLM 의도 실행 (로컬 액션 수행) ──
  const executeIntent = useCallback((result: IntentResult, speakerName: string): string => {
    const { intent } = result;
    let reply = result.reply;

    switch (intent.action) {
      case 'add_med': {
        const med = intent.medication;
        if (med?.name && med.time) {
          medsStore.addMed(med.name, med.time, med.dosage || '1회 분량');
          reply = reply || `네, ${speakerName}! [${med.time} ${med.name}] 복약 일정을 등록했습니다. 정시에 음성으로 알려드리겠습니다.`;
        } else if (!reply) {
          reply = `${speakerName}, 어떤 약을 몇 시에 등록해 드릴까요? 예: "저녁 7시에 혈압약 등록해줘"`;
        }
        break;
      }
      case 'remove_med': {
        const kw = intent.searchKeyword || intent.medication?.name || '';
        const target = medsStore.get().find(m => kw && m.name.includes(kw));
        if (target) {
          medsStore.removeMed(target.id);
          reply = reply || `네, [${target.name}] 복약 일정을 삭제했습니다.`;
        } else if (!reply) {
          reply = `${speakerName}, 어떤 약 일정을 삭제해 드릴까요? 현재 등록된 약 이름을 말씀해 주세요.`;
        }
        break;
      }
      case 'list_meds': {
        const meds = medsStore.get();
        const listText = meds.map(m => `${m.name} ${m.time}${m.taken ? ' (완료)' : ''}`).join(', ');
        reply = reply || (meds.length ? `오늘 복약 일정은 ${listText} 입니다.` : '현재 등록된 복약 일정이 없습니다.');
        break;
      }
      case 'confirm_med': {
        const meds = medsStore.get();
        const pending = meds.filter(m => !m.taken);
        if (pending.length === 1) {
          medsStore.setTaken(pending[0].id, true);
          reply = reply || `네, ${pending[0].name} 복약 완료로 기록했습니다. 참 잘하셨습니다!`;
        } else if (pending.length === 0) {
          reply = reply || '오늘 예정된 약은 모두 드셨습니다. 훌륭해요!';
        } else {
          reply = reply || `어느 약을 드셨나요? ${pending.map(m => m.name).join(', ')} 중에 말씀해 주세요.`;
        }
        break;
      }
      case 'sos_check': {
        reply = reply || `${speakerName}, 많이 불편하신가요? 화면 아래의 긴급 SOS 버튼을 길게 눌러주시거나, 전화를 연결해 드릴까요?`;
        if (onTriggerSOS) onTriggerSOS();
        break;
      }
      case 'health_log': {
        reply = reply || '말씀해 주셔서 고맙습니다. 오늘 하루도 편안하시길 바랍니다.';
        break;
      }
      default:
        reply = reply || `${speakerName}, 말씀 잘 들었습니다. 늘 곁에서 들어드리겠습니다.`;
    }
    return reply;
  }, [onTriggerSOS]);

  // ── 발화 처리 파이프라인: LLM 우선 → 로컬 폴백 ──
  const handleUserUtterance = useCallback(async (text: string) => {
    if (!text || !text.trim()) return;
    setAvatarState('thinking');

    const settings = loadLLMSettings();
    let result: IntentResult;
    let usedLLM = false;

    if (settings.apiKey) {
      try {
        result = await processUtterance(settings, text, seniorName);
        usedLLM = true;
        setLlmError(null); // 성공 시 오류 상태 해제
      } catch (e) {
        console.warn('LLM 호출 실패, 로컬 폴백 사용:', e);
        setLlmError(e instanceof Error ? e.message : 'LLM 호출 실패');
        result = localFallback(text, seniorName);
      }
    } else {
      result = localFallback(text, seniorName);
    }

    const currentManualSpeaker = manualSpeaker !== 'auto' ? manualSpeaker : manualSpeakerRef.current;
    const effectiveSpeaker: 'senior' | 'family' = currentManualSpeaker === 'auto' ? result.intent.speaker : currentManualSpeaker;
    result = {
      ...result,
      intent: {
        ...result.intent,
        speaker: effectiveSpeaker,
      },
    };

    setActiveSpeakerRole(effectiveSpeaker);
    saveChatLog(effectiveSpeaker, text.trim());

    const targetTitle = effectiveSpeaker === 'senior' ? `${seniorName} 어르신` : '보호자님';
    // LLM 응답 문구가 있으면 그대로 사용, 없으면 로컬 액션 실행 후 기본 문구 생성
    const reply = result.reply || executeIntent(result, targetTitle);

    setResponseMsg(reply);
    saveChatLog('agent', reply);
    setAvatarState(navigator.onLine ? 'idle' : 'offline');
    speakText(reply);
    if (!usedLLM && settings.apiKey) {
      console.log('로컬 폴백으로 처리됨');
    }
  }, [seniorName, manualSpeaker, saveChatLog, speakText, executeIntent]);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      setAvatarState('idle');
    } else {
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (e) {}
      } else {
        alert('이 브라우저는 음성 인식을 지원하지 않습니다. 아래 입력창에 글로 말씀해 주세요.');
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    setTranscript(textInput);
    handleUserUtterance(textInput);
    setTextInput('');
  };

  const clearChatHistory = () => {
    if (window.confirm('모든 대화 히스토리를 삭제하시겠습니까?')) {
      setChatLogs([]);
      localStorage.removeItem('senior_care_chat_history_v2');
    }
  };

  const getAvatarVisual = () => {
    switch (avatarState) {
      case 'offline':
        return { emoji: '📡', label: '오프라인 (네트워크 연결 확인)', bg: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', color: '#94a3b8' };
      case 'listening':
        return { emoji: '👂🏻', label: `${activeSpeakerRole === 'senior' ? seniorName + ' 어르신' : '보호자'} 말씀 경청 중...`, bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#10b981' };
      case 'thinking':
        return { emoji: '🤔', label: 'AI 대화 생각 중...', bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#f59e0b' };
      case 'speaking':
        return { emoji: '👵🏻', label: '효돌이가 이야기 중...', bg: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', color: '#ec4899' };
      default:
        return { emoji: '👵🏻', label: `상시 대기 중 (${apiKey ? PROVIDER_LABEL[provider] : '기본 AI'})`, bg: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', color: '#6366f1' };
    }
  };

  const visual = getAvatarVisual();

  return (
    <div className="glass-card avatar-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', minHeight: '540px', textAlign: 'center', position: 'relative' }}>

      {isOffline && (
        <div style={{ width: '100%', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '8px 14px', borderRadius: '14px', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
          ⚠️ 현재 오프라인 상태입니다. 음성 인식 자동 재시작이 일시 중지되었습니다.
        </div>
      )}

      {llmError && (
        <div style={{ width: '100%', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', color: '#fcd34d', padding: '8px 14px', borderRadius: '14px', fontSize: '0.82rem', fontWeight: 600, marginBottom: '8px', textAlign: 'left' }}>
          ⚠️ AI 연결 실패 ({llmError}) — 기본 응답으로 대체 중입니다. 설정에서 키를 확인해 주세요.
        </div>
      )}

      {/* 1. 상단 상태 및 옵션 */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.06)', padding: '6px 14px', borderRadius: '30px' }}>
          <Bot size={20} color={visual.color} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-sub)' }}>{visual.label}</span>
          {isListening && (
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center', marginLeft: '4px' }}>
              <span style={{ width: '6px', height: '14px', background: '#10b981', borderRadius: '3px', animation: 'voiceWave 0.8s infinite' }}></span>
              <span style={{ width: '6px', height: '20px', background: '#10b981', borderRadius: '3px', animation: 'voiceWave 0.6s infinite 0.2s' }}></span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowHistoryModal(true)}
            style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '0 12px', height: '38px', borderRadius: '19px', fontSize: '0.8rem' }}
          >
            <History size={16} /> 대화기록 ({chatLogs.length})
          </button>
          <button
            onClick={() => setShowModelModal(true)}
            style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', padding: '0 12px', height: '38px', borderRadius: '19px', fontSize: '0.8rem' }}
          >
            <Settings size={16} /> AI 설정
          </button>
        </div>
      </div>

      {/* 2. 발화자 구분 뱃지 */}
      <div style={{ width: '100%', background: 'rgba(15, 23, 42, 0.6)', padding: '10px 16px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-sub)' }}>
          <Sparkles size={18} color="#10b981" />
          <span>AI 발화자 구분:</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '14px',
            fontSize: '0.88rem', fontWeight: 700,
            background: activeSpeakerRole === 'senior' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
            color: activeSpeakerRole === 'senior' ? '#f59e0b' : '#34d399',
            border: activeSpeakerRole === 'senior' ? '1px solid #f59e0b' : '1px solid #10b981'
          }}>
            {activeSpeakerRole === 'senior' ? `👴 ${seniorName} 어르신` : '🧑🏻‍💼 보호자 / 자녀'}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = manualSpeaker === 'senior' ? 'auto' : 'senior';
              setManualSpeaker(next);
              setActiveSpeakerRole('senior');
            }}
            style={{
              padding: '4px 10px', minHeight: 'auto', height: '30px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 600,
              background: manualSpeaker === 'senior' ? '#f59e0b' : 'rgba(255, 255, 255, 0.08)',
              color: manualSpeaker === 'senior' ? '#0f172a' : '#cbd5e1',
              border: manualSpeaker === 'senior' ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.15)'
            }}
          >
            👴 어르신
          </button>
          <button
            type="button"
            onClick={() => {
              const next = manualSpeaker === 'family' ? 'auto' : 'family';
              setManualSpeaker(next);
              setActiveSpeakerRole('family');
            }}
            style={{
              padding: '4px 10px', minHeight: 'auto', height: '30px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 600,
              background: manualSpeaker === 'family' ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
              color: manualSpeaker === 'family' ? '#0f172a' : '#cbd5e1',
              border: manualSpeaker === 'family' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)'
            }}
          >
            🧑💼 보호자
          </button>
        </div>
      </div>

      {/* 아바타 */}
      <div
        onClick={toggleListening}
        className={`avatar-circle ${avatarState !== 'idle' ? '' : 'avatar-breathing'}`}
        style={{
          width: '160px', height: '160px', borderRadius: '50%', background: visual.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '5px solid rgba(255, 255, 255, 0.25)', cursor: 'pointer',
          boxShadow: `0 0 45px ${visual.color}66`, transition: 'all 0.4s ease'
        }}
      >
        <span className="avatar-emoji" style={{ fontSize: '68px' }}>{visual.emoji}</span>
      </div>

      {/* 답변 */}
      <div style={{ width: '100%', background: 'rgba(15, 23, 42, 0.75)', padding: '16px 20px', borderRadius: '20px', border: '1px solid var(--border-light)' }}>
        {transcript && (
          <div style={{ fontSize: '0.95rem', color: activeSpeakerRole === 'senior' ? '#f59e0b' : '#34d399', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            {activeSpeakerRole === 'senior' ? `👴 ${seniorName} 어르신` : '🧑🏻‍💼 보호자'}: "{transcript}"
          </div>
        )}
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.4 }}>
          "{responseMsg}"
        </div>
      </div>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'center' }}>
        <button
          onClick={toggleListening}
          style={{
            flex: 1,
            background: isListening ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#ffffff', fontSize: '1.25rem', height: '64px', borderRadius: '32px',
            boxShadow: '0 10px 25px rgba(99, 102, 241, 0.4)'
          }}
        >
          {isListening ? <MicOff size={28} /> : <Mic size={28} />}
          {isListening ? '말씀 끝내기' : '말씀하기 (터치)'}
        </button>
        <button
          onClick={() => speakText(responseMsg)}
          style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', borderRadius: '32px', width: '64px', height: '64px', padding: 0 }}
          title="다시 듣기"
        >
          <Volume2 size={26} />
        </button>
      </div>

      {/* 텍스트 입력 */}
      <form onSubmit={handleTextSubmit} style={{ width: '100%', display: 'flex', gap: '8px', marginTop: '4px' }}>
        <input
          type="text"
          placeholder="질문 또는 등록할 약을 입력하세요"
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          style={{ flex: 1, padding: '12px 18px', borderRadius: '16px', fontSize: '0.95rem', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
        />
        <button type="submit" style={{ background: '#6366f1', color: '#fff', padding: '0 18px', minHeight: 'auto', borderRadius: '16px' }}>
          <Send size={18} />
        </button>
      </form>

      {/* 대화 히스토리 모달 */}
      {showHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-card" style={{ maxWidth: '620px', width: '100%', padding: '28px', background: '#0f172a', border: '2px solid #10b981', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left', maxHeight: '85vh' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <History size={26} color="#10b981" /> 대화 히스토리 ({chatLogs.length}건)
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={clearChatHistory} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', minHeight: 'auto', padding: '6px 12px', borderRadius: '12px', fontSize: '0.8rem' }}>
                  <Trash2 size={16} /> 삭제
                </button>
                <button onClick={() => setShowHistoryModal(false)} style={{ background: 'transparent', color: '#cbd5e1', padding: 0, minHeight: 'auto' }}>
                  <X size={24} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '14px' }}>
              <span style={{ fontSize: '0.95rem', color: 'var(--text-sub)' }}>👴 어르신 존함:</span>
              <input
                type="text"
                value={seniorName}
                onChange={e => setSeniorName(e.target.value)}
                style={{ width: '140px', padding: '6px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid #475569', color: '#fff', fontSize: '0.95rem' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {chatLogs.map((log) => {
                let bg = 'rgba(99, 102, 241, 0.15)';
                let border = '1px solid #6366f1';
                let headerColor = '#818cf8';
                let label = '👵 효돌이 AI';
                if (log.sender === 'senior') {
                  bg = 'rgba(245, 158, 11, 0.15)'; border = '1px solid #f59e0b'; headerColor = '#f59e0b';
                  label = `👴 ${log.senderName || seniorName + ' 어르신'}`;
                } else if (log.sender === 'family') {
                  bg = 'rgba(16, 185, 129, 0.15)'; border = '1px solid #10b981'; headerColor = '#10b981';
                  label = '🧑🏻‍💼 보호자 (자녀)';
                }
                return (
                  <div key={log.id} style={{ padding: '14px 18px', borderRadius: '16px', background: bg, border, alignSelf: log.sender === 'agent' ? 'flex-start' : 'flex-end', maxWidth: '85%' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: headerColor, marginBottom: '4px' }}>
                      {label} • {log.time}
                    </div>
                    <div style={{ fontSize: '1.1rem', color: '#ffffff', lineHeight: 1.4 }}>{log.text}</div>
                  </div>
                );
              })}
            </div>

            <button onClick={() => setShowHistoryModal(false)} style={{ background: '#10b981', color: '#fff', minHeight: '48px', fontSize: '1rem' }}>
              닫기
            </button>
          </div>
        </div>
      )}

      {/* LLM 설정 모달 */}
      {showModelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-card" style={{ maxWidth: '520px', width: '100%', padding: '28px', background: '#0f172a', border: '2px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={24} color="#f59e0b" /> AI 엔진 & API 키 설정
              </h3>
              <button onClick={() => setShowModelModal(false)} style={{ background: 'transparent', color: '#cbd5e1', padding: 0, minHeight: 'auto' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '1rem', color: 'var(--text-sub)' }}>AI 대화 엔진 선택:</label>

              {(['glm', 'gemini-flash', 'openai-gpt4o'] as LLMProvider[]).map(p => (
                <div
                  key={p}
                  onClick={() => setProvider(p)}
                  style={{
                    padding: '16px', borderRadius: '16px', cursor: 'pointer',
                    background: provider === p ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                    border: provider === p ? '2px solid #6366f1' : '1px solid var(--border-light)'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>{PROVIDER_LABEL[p]}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: '4px' }}>
                    {p === 'glm' && 'ZAI GLM (glm-4-flash) - 발화 의도 분석 및 대화 처리' }
                    {p === 'gemini-flash' && 'Google Gemini 2.0 Flash - 자연스러운 감정 교감 대화' }
                    {p === 'openai-gpt4o' && 'OpenAI GPT-4o-mini - 정교한 맥락 대화' }
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.04)', padding: '16px', borderRadius: '16px' }}>
              <label style={{ fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Key size={18} color="#f59e0b" /> {PROVIDER_LABEL[provider]} API Key:
              </label>
              <input
                type="password"
                placeholder="API Key를 입력하세요"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '1rem', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                * 키는 암호화 없이 이 기기의 localStorage에 저장됩니다. 키가 없으면 기본 내장 응답으로 동작합니다.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={async () => {
                  setLlmTestResult(null);
                  const s = { provider, apiKey };
                  try {
                    const r = await processUtterance(s, '안녕하세요', '테스트');
                    setLlmTestResult(r.intent && r.reply !== undefined
                      ? { ok: true, message: `연결 성공 (모델 응답: "${(r.reply || 'OK').slice(0, 40)}")` }
                      : { ok: false, message: '응답 형식 이상' });
                  } catch (e) {
                    setLlmTestResult({ ok: false, message: e instanceof Error ? e.message : '실패' });
                  }
                }}
                style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff', minHeight: '52px' }}
              >
                연결 테스트
              </button>
              <button
                onClick={() => {
                  saveLLMSettings({ provider, apiKey });
                  setLlmError(null);
                  setShowModelModal(false);
                }}
                style={{ flex: 1, background: 'var(--primary)', color: '#fff', minHeight: '52px', fontSize: '1.1rem' }}
              >
                설정 저장
              </button>
            </div>
            {llmTestResult && (
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: llmTestResult.ok ? '#34d399' : '#f87171', textAlign: 'center' }}>
                {llmTestResult.ok ? '✓ ' : '✗ '}{llmTestResult.message}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
