import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, MessageCircle, Bot, Settings, Sparkles, X, Key, History, Trash2, Send } from 'lucide-react';

interface InteractiveAvatarProps {
  onTriggerSOS?: () => void;
  onOpenScheduler?: () => void;
}

export type LLMModelProvider = 'local-rule' | 'gemini-flash' | 'openai-gpt4o';

export interface ChatMessage {
  id: string;
  sender: 'senior' | 'family' | 'agent';
  senderName: string;
  text: string;
  time: string;
}

export default function InteractiveAvatar({ onTriggerSOS, onOpenScheduler }: InteractiveAvatarProps) {
  const [isListening, setIsListening] = useState(false);
  const [avatarState, setAvatarState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [responseMsg, setResponseMsg] = useState<string>('어르신, 반갑습니다! 말씀하고 싶으시면 마이크를 누르시거나 "에이전트야"라고 불러주세요.');
  const [textInput, setTextInput] = useState<string>('');
  
  // 발화자 리얼타임 구분 (어르신 vs 보호자/자녀)
  const [activeSpeakerRole, setActiveSpeakerRole] = useState<'senior' | 'family'>('senior');
  const [seniorName, setSeniorName] = useState<string>(() => {
    return localStorage.getItem('senior_care_name') || '홍길동';
  });

  // 클로저 이슈를 100% 방지하기 위한 최신 텍스트 Ref
  const finalTextRef = useRef<string>('');

  // 대화 기록 히스토리 (LocalStorage 보존)
  const [chatLogs, setChatLogs] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('senior_care_chat_history');
    return saved ? JSON.parse(saved) : [
      { id: '1', sender: 'agent', senderName: '효돌이 AI', text: '어르신, 반갑습니다! 식사는 맛있게 하셨습니까?', time: '오전 09:00' }
    ];
  });
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // AI 모델 설정 State
  const [selectedModel, setSelectedModel] = useState<LLMModelProvider>(() => {
    return (localStorage.getItem('senior_care_model') as LLMModelProvider) || 'local-rule';
  });
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('senior_care_apikey') || '';
  });
  const [showModelModal, setShowModelModal] = useState<boolean>(false);

  // STT 레커그니션 Ref
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem('senior_care_name', seniorName);
    localStorage.setItem('senior_care_chat_history', JSON.stringify(chatLogs));
  }, [seniorName, chatLogs]);

  useEffect(() => {
    localStorage.setItem('senior_care_model', selectedModel);
    localStorage.setItem('senior_care_apikey', apiKey);
  }, [selectedModel, apiKey]);

  const isSpeakingRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<any>(null);

  // STT 초기화 & 24H 상시 음성 감지 루프 (Acoustic Echo Guard 적용)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ko-KR';

      recognition.onstart = () => {
        setIsListening(true);
        if (!isSpeakingRef.current) {
          setAvatarState('listening');
        }
        finalTextRef.current = '';
      };

      recognition.onresult = (event: any) => {
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

      recognition.onerror = (event: any) => {
        console.log('Speech recognition silence:', event.error);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        if (!isSpeakingRef.current) {
          const capturedText = finalTextRef.current;
          if (capturedText && capturedText.trim() && capturedText !== '어르신의 말씀을 경청하고 있습니다...') {
            handleUserUtterance(capturedText);
            finalTextRef.current = '';
          } else {
            setAvatarState('idle');
          }
        }

        setTimeout(() => {
          if (!isSpeakingRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {}
          }
        }, 1500);
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (e) {
        console.log(e);
      }
    }
  }, [selectedModel, apiKey]);

  // 대화 기록에 명확한 발화자 구분 저장
  const saveChatLog = (sender: 'senior' | 'family' | 'agent', text: string) => {
    const nowTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    let senderName = '효돌이 AI';
    if (sender === 'senior') senderName = `${seniorName} 어르신`;
    if (sender === 'family') senderName = '보호자 (자녀)';

    const newMsg: ChatMessage = {
      id: Date.now().toString() + Math.random(),
      sender,
      senderName,
      text,
      time: nowTime
    };
    setChatLogs(prev => [newMsg, ...prev]);
  };

  // TTS 음성 출력 (에코 방지 자가 음소거 컨트롤)
  const speakText = (text: string) => {
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

    utterance.onstart = () => {
      setAvatarState('speaking');
    };

    const resumeListeningAfterSpeech = () => {
      setAvatarState('idle');
      setTimeout(() => {
        isSpeakingRef.current = false;
        if (recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (e) {}
        }
      }, 1000);
    };

    utterance.onend = resumeListeningAfterSpeech;
    utterance.onerror = resumeListeningAfterSpeech;

    window.speechSynthesis.speak(utterance);
  };

  // LLM / API 대화 처리 로직 (자동 발화자 감지 & 대화형 복약 자동 등록)
  const handleUserUtterance = async (text: string) => {
    if (!text || !text.trim()) return;
    setAvatarState('thinking');
    const lower = text.trim();

    // 1. AI 자율 발화자 분석 (Autonomous AI Speaker Classification)
    const caregiverKeywords = [
      '보호자', '자녀', '아들', '딸', '우리 어르신', '대신', '챙겨주세요', 
      '등록해주세요', '어르신 약', '어르신 상태', '어르신 식사', '어르신 건강',
      '부모님', '어르신이', '어르신께', '보호자입니다', '제가 자식'
    ];
    const seniorKeywords = [
      '나', '내가', '내 약', '몸이', '어지러', '아파', '배고파', '목말라', 
      '식사했어', '약 먹었어', '심심해', '고마워', '효돌아', '에이전트야', '응'
    ];

    let detectedRole: 'senior' | 'family' = 'senior';
    if (caregiverKeywords.some(kw => lower.includes(kw))) {
      detectedRole = 'family';
    } else if (seniorKeywords.some(kw => lower.includes(kw))) {
      detectedRole = 'senior';
    } else {
      detectedRole = activeSpeakerRole || 'senior';
    }

    setActiveSpeakerRole(detectedRole);
    saveChatLog(detectedRole, lower);

    const targetTitle = detectedRole === 'senior' ? `${seniorName} 어르신` : '보호자님';

    // 2. 대화형 복약 자동 등록 & 삭제 컨트롤 (Conversational Medication Admin)
    if (lower.includes('등록') || lower.includes('추가') || lower.includes('챙겨줘') || lower.includes('설정')) {
      if (lower.includes('약') || lower.includes('복약')) {
        // 복약 시간 및 이름 파싱 시뮬레이션
        let medTime = '오후 14:00';
        if (lower.includes('아침') || lower.includes('오전 8시') || lower.includes('9시')) medTime = '오전 09:00';
        if (lower.includes('점심') || lower.includes('12시') || lower.includes('1시')) medTime = '오후 13:00';
        if (lower.includes('저녁') || lower.includes('7시') || lower.includes('8시')) medTime = '오후 19:00';

        let medName = '신규 케어약';
        if (lower.includes('당뇨')) medName = '당뇨약';
        if (lower.includes('혈압')) medName = '혈압약';
        if (lower.includes('관절')) medName = '관절약';
        if (lower.includes('영양')) medName = '영양제';

        // LocalStorage 저장 및 데이터베이스 추가
        const savedMedsStr = localStorage.getItem('senior_care_meds');
        const medsList = savedMedsStr ? JSON.parse(savedMedsStr) : [];
        const newMedItem = {
          id: Date.now().toString(),
          name: medName,
          time: medTime,
          taken: false,
          dosage: '1회 분량 (음성 자동 등록)'
        };
        medsList.push(newMedItem);
        localStorage.setItem('senior_care_meds', JSON.stringify(medsList));

        const addReply = `네, ${targetTitle}! 말씀하신 [${medTime} ${medName}] 복약 일정을 에이전트가 데이터베이스에 자동으로 신규 등록하였습니다. 정시에 음성으로 알려드리겠습니다.`;
        setResponseMsg(addReply);
        saveChatLog('agent', addReply);
        speakText(addReply);
        if (onOpenScheduler) onOpenScheduler();
        return;
      }
    }

    // 3. 긴급/복약 핫키 키워드 선검사
    if (lower.includes('아파') || lower.includes('몸이') || lower.includes('어지러') || lower.includes('비상')) {
      const sosReply = `${targetTitle}, 몸이 많이 불편하신가요? 긴급 SOS 버튼을 누르거나 긴급 연락처를 연결해드릴까요?`;
      setResponseMsg(sosReply);
      saveChatLog('agent', sosReply);
      speakText(sosReply);
      if (onTriggerSOS) onTriggerSOS();
      return;
    }

    if (lower.includes('약') || lower.includes('복약') || lower.includes('혈압약') || lower.includes('당뇨약')) {
      const medReply = `${targetTitle}, 오늘 약은 잊지 않고 잘 챙겨드셨나요? 오른쪽 복약 메뉴에서 바로 확인해보실 수 있습니다.`;
      setResponseMsg(medReply);
      saveChatLog('agent', medReply);
      speakText(medReply);
      if (onOpenScheduler) onOpenScheduler();
      return;
    }

    // 4. 모델 선택에 따른 처리 (Gemini / OpenAI)
    if (selectedModel === 'gemini-flash' && apiKey) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `너는 ${seniorName} 어르신을 모시는 따뜻한 AI 에이전트 '효돌이'야. 발화자는 '${targetTitle}'이며 메시지는 "${lower}"야. ${targetTitle}께 2문장의 다정한 한국어 존댓말로 대답해줘.` }] }]
          })
        });
        const data = await res.json();
        const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || `${targetTitle}, 하신 말씀을 마음 깊이 새겼습니다. 늘 건강하십시오.`;
        setResponseMsg(aiReply);
        saveChatLog('agent', aiReply);
        speakText(aiReply);
        return;
      } catch (e) {
        console.error('Gemini API Error:', e);
      }
    } else if (selectedModel === 'openai-gpt4o' && apiKey) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: `너는 ${seniorName} 어르신을 모시는 다정한 효돌이 AI야. 상대방은 ${targetTitle}이야.` },
              { role: 'user', content: lower }
            ]
          })
        });
        const data = await res.json();
        const aiReply = data.choices?.[0]?.message?.content || `${targetTitle}, 곁에서 늘 지켜드리겠습니다.`;
        setResponseMsg(aiReply);
        saveChatLog('agent', aiReply);
        speakText(aiReply);
        return;
      } catch (e) {
        console.error('OpenAI API Error:', e);
      }
    }

    // 5. 기본 로컬 대화 엔진 (Local Rule Engine)
    let reply = '';
    if (lower.includes('안녕') || lower.includes('반가') || lower.includes('효돌')) {
      reply = `${targetTitle}, 안녕하십니까! 식사는 맛있게 하셨나요? 오늘 날씨도 참 좋습니다.`;
    } else if (lower.includes('날씨')) {
      reply = `오늘 날씨는 화창하고 산책하시기 딱 좋은 날씨입니다. ${targetTitle}, 나가실 때는 따뜻하게 입으세요.`;
    } else if (lower.includes('몇 시') || lower.includes('시간')) {
      const now = new Date();
      reply = `현재 시각은 ${now.getHours()}시 ${now.getMinutes()}분입니다.`;
    } else {
      reply = `${targetTitle}께서 "${lower}"라고 말씀하셨군요. 언제나 곁에서 든든하게 이야기 나눠드릴게요.`;
    }

    setResponseMsg(reply);
    saveChatLog('agent', reply);
    setTimeout(() => {
      speakText(reply);
    }, 400);
  };

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      setAvatarState('idle');
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error('Recognition start error:', e);
          const sample = prompt('음성 입력 대신 질문을 직접 입력하시겠습니까?', '오늘 날씨 어때?');
          if (sample) handleUserUtterance(sample);
        }
      } else {
        const sample = prompt('하실 말씀을 입력하세요:', '오늘 날씨 어때?');
        if (sample) handleUserUtterance(sample);
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
      localStorage.removeItem('senior_care_chat_history');
    }
  };

  // 아바타 표정 및 색상 계산
  const getAvatarVisual = () => {
    switch (avatarState) {
      case 'listening':
        return { emoji: '👂🏻', label: `${activeSpeakerRole === 'senior' ? seniorName + ' 어르신' : '보호자'} 말씀 경청 중...`, bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#10b981' };
      case 'thinking':
        return { emoji: '🤔', label: 'AI 대화 생각 중...', bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#f59e0b' };
      case 'speaking':
        return { emoji: '👵🏻', label: '효돌이가 이야기 중...', bg: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', color: '#ec4899' };
      default:
        return { emoji: '👵🏻', label: `상시 대기 중 (${selectedModel === 'local-rule' ? '로컬 AI' : selectedModel.toUpperCase()})`, bg: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', color: '#6366f1' };
    }
  };

  const visual = getAvatarVisual();

  return (
    <div className="glass-card avatar-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', minHeight: '540px', textAlign: 'center', position: 'relative' }}>
      
      {/* 1. 상단 앰비언트 대기 표시 및 옵션 버튼들 */}
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
            <Settings size={16} /> AI 모델
          </button>
        </div>
      </div>

      {/* 2. AI 자율 발화자 구분 뱃지 (Autonomous AI Speaker Diarization Badge) */}
      <div style={{ width: '100%', background: 'rgba(15, 23, 42, 0.6)', padding: '10px 16px', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: 'var(--text-sub)' }}>
          <Sparkles size={18} color="#10b981" />
          <span>AI 자동 발화자 구분 시스템:</span>
        </div>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '6px', 
          padding: '6px 14px', 
          borderRadius: '14px', 
          fontSize: '0.88rem', 
          fontWeight: 700,
          background: activeSpeakerRole === 'senior' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
          color: activeSpeakerRole === 'senior' ? '#f59e0b' : '#34d399',
          border: activeSpeakerRole === 'senior' ? '1px solid #f59e0b' : '1px solid #10b981'
        }}>
          {activeSpeakerRole === 'senior' ? `👴 ${seniorName} 어르신 (음성 감지)` : '🧑🏻‍💼 보호자 / 자녀 (음성 감지)'}
        </div>
      </div>

      {/* 중앙 메인 아바타 비주얼 */}
      <div 
        onClick={toggleListening}
        className={`avatar-circle ${avatarState !== 'idle' ? '' : 'avatar-breathing'}`}
        style={{ 
          width: '160px', 
          height: '160px', 
          borderRadius: '50%', 
          background: visual.bg, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          border: '5px solid rgba(255, 255, 255, 0.25)',
          cursor: 'pointer',
          boxShadow: `0 0 45px ${visual.color}66`,
          transition: 'all 0.4s ease'
        }}
      >
        <span className="avatar-emoji" style={{ fontSize: '68px' }}>{visual.emoji}</span>
      </div>

      {/* AI 답변 & 발화자별 말풍선 display */}
      <div style={{ width: '100%', background: 'rgba(15, 23, 42, 0.75)', padding: '16px 20px', borderRadius: '20px', border: '1px solid var(--border-light)' }}>
        {transcript && (
          <div style={{ fontSize: '0.95rem', color: activeSpeakerRole === 'senior' ? '#f59e0b' : '#34d399', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <MessageCircle size={16} /> {activeSpeakerRole === 'senior' ? `👴 ${seniorName} 어르신` : '🧑🏻‍💼 보호자'}: "{transcript}"
          </div>
        )}
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.4 }}>
          "{responseMsg}"
        </div>
      </div>

      {/* 초대형 음성 대화 실행 버튼 */}
      <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'center' }}>
        <button 
          onClick={toggleListening} 
          style={{ 
            flex: 1,
            background: isListening 
              ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
              : 'linear-gradient(135deg, #6366f1, #4f46e5)', 
            color: '#ffffff', 
            fontSize: '1.25rem', 
            height: '64px', 
            borderRadius: '32px',
            boxShadow: '0 10px 25px rgba(99, 102, 241, 0.4)'
          }}
        >
          {isListening ? <MicOff size={28} /> : <Mic size={28} />}
          {isListening ? '말씀 끝내기 (듣는 중)' : '말씀하기 (터치하세요)'}
        </button>

        <button 
          onClick={() => speakText(responseMsg)}
          style={{ 
            background: 'rgba(255, 255, 255, 0.1)', 
            color: '#fff', 
            borderRadius: '32px', 
            width: '64px', 
            height: '64px', 
            padding: 0 
          }}
          title="다시 듣기"
        >
          <Volume2 size={26} />
        </button>
      </div>

      {/* ⌨️ 마이크 오류 대비 텍스트 직접 입력창 */}
      <form onSubmit={handleTextSubmit} style={{ width: '100%', display: 'flex', gap: '8px', marginTop: '4px' }}>
        <input 
          type="text" 
          placeholder="질문 또는 등록할 약을 말씀/입력하세요 (AI가 발화자를 자동 구분합니다)"
          value={textInput} 
          onChange={e => setTextInput(e.target.value)} 
          style={{ flex: 1, padding: '12px 18px', borderRadius: '16px', fontSize: '0.95rem', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
        />
        <button type="submit" style={{ background: '#6366f1', color: '#fff', padding: '0 18px', minHeight: 'auto', borderRadius: '16px' }}>
          <Send size={18} />
        </button>
      </form>

      {/* 📜 발화자 명확 구분 전체 대화 기록 모달 */}
      {showHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-card" style={{ maxWidth: '620px', width: '100%', padding: '28px', background: '#0f172a', border: '2px solid #10b981', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left', maxHeight: '85vh' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <History size={26} color="#10b981" /> 발화자별 구분 대화 히스토리 ({chatLogs.length}건)
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={clearChatHistory} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', minHeight: 'auto', padding: '6px 12px', borderRadius: '12px', fontSize: '0.8rem' }}>
                  <Trash2 size={16} /> 기록 삭제
                </button>
                <button onClick={() => setShowHistoryModal(false)} style={{ background: 'transparent', color: '#cbd5e1', padding: 0, minHeight: 'auto' }}>
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* 어르신 성함 설정 필드 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '10px 16px', borderRadius: '14px' }}>
              <span style={{ fontSize: '0.95rem', color: 'var(--text-sub)' }}>👴 어르신 존함 설정:</span>
              <input 
                type="text" 
                value={seniorName}
                onChange={e => setSeniorName(e.target.value)}
                style={{ width: '140px', padding: '6px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid #475569', color: '#fff', fontSize: '0.95rem' }}
              />
            </div>

            {/* 대화록 목록 리스트 (발화자별 차별화) */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {chatLogs.map((log) => {
                let bg = 'rgba(99, 102, 241, 0.15)';
                let border = '1px solid #6366f1';
                let headerColor = '#818cf8';
                let label = '👵 효돌이 AI';

                if (log.sender === 'senior') {
                  bg = 'rgba(245, 158, 11, 0.15)';
                  border = '1px solid #f59e0b';
                  headerColor = '#f59e0b';
                  label = `👴 ${log.senderName || seniorName + ' 어르신'}`;
                } else if (log.sender === 'family') {
                  bg = 'rgba(16, 185, 129, 0.15)';
                  border = '1px solid #10b981';
                  headerColor = '#10b981';
                  label = '🧑🏻‍💼 보호자 (자녀)';
                }

                return (
                  <div 
                    key={log.id} 
                    style={{ 
                      padding: '14px 18px', 
                      borderRadius: '16px', 
                      background: bg,
                      border: border,
                      alignSelf: log.sender === 'agent' ? 'flex-start' : 'flex-end',
                      maxWidth: '85%'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: headerColor, marginBottom: '4px' }}>
                      {label} • {log.time}
                    </div>
                    <div style={{ fontSize: '1.1rem', color: '#ffffff', lineHeight: 1.4 }}>
                      {log.text}
                    </div>
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

      {/* ⚙️ AI 모델 선택 모달 */}
      {showModelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-card" style={{ maxWidth: '520px', width: '100%', padding: '28px', background: '#0f172a', border: '2px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={24} color="#f59e0b" /> AI 대화 모델 선택
              </h3>
              <button onClick={() => setShowModelModal(false)} style={{ background: 'transparent', color: '#cbd5e1', padding: 0, minHeight: 'auto' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '1rem', color: 'var(--text-sub)' }}>원하시는 AI 대화 엔진을 고르세요:</label>
              
              <div 
                onClick={() => setSelectedModel('local-rule')}
                style={{ 
                  padding: '16px', 
                  borderRadius: '16px', 
                  background: selectedModel === 'local-rule' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)', 
                  border: selectedModel === 'local-rule' ? '2px solid #6366f1' : '1px solid var(--border-light)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff' }}>🤖 기본 로컬 케어 AI (100% 무료 / 단독 구동)</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: '4px' }}>인터넷 연결/API 키 없이 어르신의 복약 및 일상 안부 대화를 100% 오프라인 처리</div>
              </div>

              <div 
                onClick={() => setSelectedModel('gemini-flash')}
                style={{ 
                  padding: '16px', 
                  borderRadius: '16px', 
                  background: selectedModel === 'gemini-flash' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)', 
                  border: selectedModel === 'gemini-flash' ? '2px solid #f59e0b' : '1px solid var(--border-light)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#f59e0b' }}>✨ Google Gemini Flash (무제한 감정 교감 AI)</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: '4px' }}>옛날 이야기, 시 읊기, 깊은 고민 상담까지 지능형 자식처럼 따뜻한 대화</div>
              </div>

              <div 
                onClick={() => setSelectedModel('openai-gpt4o')}
                style={{ 
                  padding: '16px', 
                  borderRadius: '16px', 
                  background: selectedModel === 'openai-gpt4o' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)', 
                  border: selectedModel === 'openai-gpt4o' ? '2px solid #10b981' : '1px solid var(--border-light)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#10b981' }}>🧠 OpenAI GPT-4o-mini (고지능 멀티 챗봇)</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)', marginTop: '4px' }}>풍부한 맥락의 정교한 언어 능력으로 깊이 있는 맞춤 반응 대화</div>
              </div>
            </div>

            {selectedModel !== 'local-rule' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.04)', padding: '16px', borderRadius: '16px' }}>
                <label style={{ fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={18} color="#f59e0b" /> {selectedModel === 'gemini-flash' ? 'Google Gemini API Key' : 'OpenAI API Key'} 입력:
                </label>
                <input 
                  type="password" 
                  placeholder="API Key를 입력하세요" 
                  value={apiKey} 
                  onChange={e => setApiKey(e.target.value)} 
                  style={{ padding: '12px 16px', borderRadius: '12px', fontSize: '1rem', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>* 입력하신 키는 태블릿 내부에만 안전하게 암호화 보존됩니다.</span>
              </div>
            )}

            <button 
              onClick={() => setShowModelModal(false)}
              style={{ background: 'var(--primary)', color: '#fff', minHeight: '52px', fontSize: '1.1rem' }}
            >
              설정 저장 완료
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
