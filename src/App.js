import React, { useState, useEffect, useRef } from 'react';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import axios from 'axios';
import html2canvas from 'html2canvas';
import './App.css';
import Mammoth from 'mammoth';
import { styled } from '@mui/material/styles';
import Button from '@mui/material/Button';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CircularProgress from '@mui/material/CircularProgress';
import KeyboardIcon from '@mui/icons-material/Keyboard';

const AZURE_DOC_INTELLIGENCE_KEY = process.env.REACT_APP_AZURE_DOC_INTELLIGENCE_KEY;
const AZURE_DOC_INTELLIGENCE_ENDPOINT = process.env.REACT_APP_AZURE_DOC_INTELLIGENCE_ENDPOINT;

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

const QUESTION_WORDS = [
  'what', 'how', 'why', 'when', 'where', 'who', 'which', 'whom', 'whose', 'is', 'are', 'can', 'could', 'would', 'should', 'do', 'does', 'did', 'will', 'shall', 'may', 'might', 'have', 'has', 'had', 'am', 'was', 'were', 'did', 'does', 'do'
];

const App = () => {
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('Java');
  const [isSettingsHovered, setIsSettingsHovered] = useState(false);
  const [glassOpacity, setGlassOpacity] = useState(0.6);
  const [isVisible, setIsVisible] = useState(true); // New state to track visibility
  const settingsRef = useRef(null);
  const recognizerRef = useRef(null);
  const audioStreamRef = useRef(null);
  const [screenshotQueue, setScreenshotQueue] = useState([]);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [resumeContext, setResumeContext] = useState(null); // Store resume context/summary
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [isSolvingScreenshots, setIsSolvingScreenshots] = useState(false);
  const [isShortcutsHovered, setIsShortcutsHovered] = useState(false);
  const shortcutsRef = useRef(null);
  const [requestToken, setRequestToken] = useState(0); // Token to track latest request
  const latestRequestToken = useRef(0);
  const [lastPrompt, setLastPrompt] = useState(null);
  const [lastImageData, setLastImageData] = useState(null);
  const [lastLanguage, setLastLanguage] = useState(null);
  const [showRetry, setShowRetry] = useState(false);

  const SPEECH_KEY = process.env.REACT_APP_SPEECH_KEY;
  const SPEECH_REGION = "eastus";
  const API_KEY = process.env.REACT_APP_API_KEY;
  const API_URL = process.env.REACT_APP_API_URL;
  const DEPLOYMENT_ID = process.env.REACT_APP_DEPLOYMENT_ID;

  const moveWindow = (direction) => {
    const step = 20;
    if (window.electron && window.electron.moveWindow) {
      window.electron.moveWindow(direction, step);
    }
  };

  useEffect(() => {
    if (window.electron && window.electron.onShortcut) {
      window.electron.onShortcut((data) => {
        switch (data.action) {
          case 'moveWindow':
            moveWindow(data.direction);
            break;
          case 'takeScreenshot':
            takeScreenshot(selectedLanguage);
            break;
          case 'startOver':
            startOver();
            break;
          case 'toggleVisibility':
            setIsVisible(prev => {
              const newVisible = !prev;
              if (window.electron && window.electron.toggleVisibility) {
                window.electron.toggleVisibility(newVisible);
              }
              return newVisible;
            });
            break;
          case 'solveScreenshots':
            if (screenshotQueue.length === 0) {
              setAiResponse('No screenshots found.');
            } else {
              setIsSolvingScreenshots(true);
              solveScreenshots().finally(() => setIsSolvingScreenshots(false));
            }
            break;
          default:
            break;
        }
      });
    }
  }, [selectedLanguage, screenshotQueue]);

  const cleanupRecognition = () => {
    if (recognizerRef.current) {
      try {
        recognizerRef.current.close();
        recognizerRef.current = null;
      } catch (error) {}
    }
    if (audioStreamRef.current) {
      try {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      } catch (error) {}
    }
  };

  useEffect(() => {
    return cleanupRecognition;
  }, []);

  useEffect(() => {
    const appContainer = document.querySelector('.App');
    if (appContainer) {
      appContainer.style.background = `linear-gradient(135deg, rgba(50, 50, 55, ${glassOpacity}), rgba(70, 70, 75, ${glassOpacity}))`;
    }
  }, [glassOpacity]);

  useEffect(() => {
    if (isSettingsHovered && settingsRef.current) {
      const settingsHeight = settingsRef.current.scrollHeight;
      const appHeight = document.querySelector('.App').scrollHeight;
      const totalHeight = 20;
      if (window.electron && window.electron.setSize) {
        window.electron.setSize(600, Math.max(150, totalHeight));
      }
    }
  }, [isSettingsHovered]);

  useEffect(() => {
    let panelHeight = 0;
    if (isSettingsHovered && settingsRef.current) {
      panelHeight = settingsRef.current.scrollHeight;
    } else if (isShortcutsHovered && shortcutsRef.current) {
      panelHeight = shortcutsRef.current.scrollHeight;
    }
    
    // Get the actual content area height
    const contentArea = document.querySelector('.content-area');
    const contentHeight = contentArea ? contentArea.scrollHeight : 0;
    
    // Calculate total height including content area
    const appHeight = document.querySelector('.App').scrollHeight;
    let totalHeight = appHeight + (panelHeight ? panelHeight : 0) + 20;
    
    // If there's content in the content area, use that for dynamic sizing
    if (contentHeight > 0) {
      totalHeight = Math.max(totalHeight, contentHeight + 120); // 120px for header and padding
    }
    
    if (window.electron && window.electron.setSize) {
      window.electron.setSize(600, Math.max(150, totalHeight));
    }
  }, [transcript, aiResponse, isSettingsHovered, isShortcutsHovered, isThinking, isSolvingScreenshots, screenshotQueue.length]);

  // Helper: check if a string is a question
  const isQuestion = (text) => {
    if (!text) return false;
    const lower = text.trim().toLowerCase();
    if (lower.includes('?')) return true;
    return QUESTION_WORDS.some(word => lower.startsWith(word + ' '));
  };

  // Always use microphone for speech recognition
  const startRecognition = async () => {
    setTranscript('');
    setAiResponse('');
    setIsListening(true);
    let stream;
    try {
      if (window.navigator.mediaDevices && window.AudioContext) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } else {
        setTranscript('Microphone access is not supported in this browser.');
        setIsListening(false);
        return;
      }
      audioStreamRef.current = stream;

      if (!SPEECH_KEY || !SPEECH_REGION) {
        setTranscript('Azure Speech Service credentials are missing. Please check your environment variables.');
        setIsListening(false);
        cleanupRecognition();
        return;
      }

      const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
      speechConfig.speechRecognitionLanguage = 'en-US';
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "15000");
      speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "3000");
      speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "3000");

      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      recognizerRef.current = recognizer;

      recognizer.recognizing = (s, e) => {
        setTranscript(`Listening... ${e.result.text}`);
      };

      recognizer.recognized = async (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech && e.result.text.trim()) {
          const userInput = e.result.text.trim();
          setTranscript(userInput);
          // Always send to API
          setIsListening(false);
          cleanupRecognition();
          await sendToOpenAI(userInput, null, selectedLanguage);
        }
      };

      recognizer.canceled = (s, e) => {
        setIsListening(false);
        if (e.reason === sdk.CancellationReason.Error) {
          setTranscript(`Speech recognition error: ${e.errorDetails}`);
        } else if (e.reason === sdk.CancellationReason.EndOfStream) {
          setTranscript('No speech detected. Please try again and speak clearly.');
        } else {
          setTranscript('Speech recognition was canceled.');
        }
        cleanupRecognition();
      };

      recognizer.sessionStopped = (s, e) => {
        setIsListening(false);
        cleanupRecognition();
      };

      recognizer.startContinuousRecognitionAsync();
      // No timeout! Only user can stop.
    } catch (err) {
      setIsListening(false);
      setTranscript(`Microphone access denied: ${err.message}`);
      cleanupRecognition();
    }
  };

  const stopRecognition = () => {
    if (recognizerRef.current) {
      recognizerRef.current.stopContinuousRecognitionAsync();
    }
    setIsListening(false);
    cleanupRecognition();
  };

  const handleResumeUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsUploadingResume(true);
    let extractedText = '';
    try {
      if (file.type === 'application/pdf') {
        // Use Azure Document Intelligence for PDF parsing
        const url = `${AZURE_DOC_INTELLIGENCE_ENDPOINT}formrecognizer/documentModels/prebuilt-document:analyze?api-version=2023-07-31`;
        const pdfArrayBuffer = await file.arrayBuffer();
        const response = await axios.post(url, pdfArrayBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Ocp-Apim-Subscription-Key': AZURE_DOC_INTELLIGENCE_KEY,
          },
          maxBodyLength: Infinity,
        });
        // Poll the operation-location for result
        const operationLocation = response.headers['operation-location'];
        let pollResult = null;
        for (let i = 0; i < 20; i++) { // Poll up to 20 times (about 20 seconds)
          await new Promise(res => setTimeout(res, 1000));
          const pollResponse = await axios.get(operationLocation, {
            headers: {
              'Ocp-Apim-Subscription-Key': AZURE_DOC_INTELLIGENCE_KEY,
            },
          });
          if (pollResponse.data.status === 'succeeded') {
            pollResult = pollResponse.data;
            break;
          } else if (pollResponse.data.status === 'failed') {
            throw new Error('Azure Document Intelligence failed to analyze the document.');
          }
        }
        if (!pollResult) throw new Error('Timed out waiting for Azure Document Intelligence.');
        // Extract text from the result
        extractedText = pollResult.analyzeResult.content || '';
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name.endsWith('.docx')
      ) {
        // DOCX parsing
        const arrayBuffer = await file.arrayBuffer();
        const result = await Mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else {
        setAiResponse('Unsupported file type. Please upload a PDF or DOCX resume.');
        setIsUploadingResume(false);
        return;
      }
      // Send extracted text to OpenAI for context
      const contextPrompt = `This is my resume. Please analyze it and remember my background for future interview questions and give answers in my perspective sucbh that i can read them directly and plese give in minimal.\n\n${extractedText}`;
      await sendToOpenAI(contextPrompt);
      setResumeContext(extractedText);
      setResumeUploaded(true);
      setAiResponse('Resume uploaded and analyzed. You can now ask interview questions.');
    } catch (error) {
      setAiResponse('Failed to parse or analyze resume. Please try again.');
    }
    setIsUploadingResume(false);
  };

  const sendToOpenAI = async (prompt, imageData = null, language = null, token = null, retryCount = 0) => {
    if (!API_KEY || !API_URL || !DEPLOYMENT_ID) {
      setAiResponse('OpenAI API configuration is missing. Please check environment variables.');
      setIsThinking(false);
      return;
    }

    setLastPrompt(prompt);
    setLastImageData(imageData);
    setLastLanguage(language);
    setShowRetry(false);

    const targetLanguage = language || selectedLanguage;
    setIsThinking(true);

    const thisToken = token !== null ? token : latestRequestToken.current;

    try {
      const messages = [];
      if (resumeContext) {
        messages.push({
          role: 'system',
          content: `You are an interview assistant. The following is the user's resume context: ${resumeContext}. Answer all questions as if you are the user, in their perspective, with short and best answers.`,
        });
      } else {
        messages.push({
          role: 'system',
          content: `You are a coding/apptitude assistant that provides solutions in ${targetLanguage}.`,
        });
      }

      let userPrompt = prompt;
      if (imageData) {
        userPrompt = `You are an expert coding and aptitude interview assistant. Analyze the image(s) for either a coding problem or an aptitude/option-based question.\n\nIf it is a coding problem and a solution/code is present in the image, respond with three sections:\n\n**Comparison:**\n- Compare the provided solution with an optimized solution. If the provided solution is wrong, correct it and provide the updated solution.\n\n**Optimized Solution:**\n- The best/optimized solution in ${targetLanguage}, perfectly formatted, with comments allowed, very small font, and syntax highlighting.\n\n**Complexity:**\n- Time Complexity: O(n)\n- Space Complexity: O(1)\n\nIf no solution is present, respond with three sections:\n\n**Approach:**\n- Three concise bullet points describing the approach, in a way that I can read directly to an interviewer.\n\n**Solution:**\n- The complete solution in ${targetLanguage}, perfectly formatted, with comments allowed, very small font, and syntax highlighting.\n\n**Complexity:**\n- Time Complexity: O(n)\n- Space Complexity: O(1)\n\nIf it is an aptitude or option-based question, respond with exactly two sections, each with a bold heading:\n\n**Answer:**\n- The correct answer, including the option number.\n\n**Short explanation:**\n- A very short explanation of the answer.\n\nFormat your response clearly and do not include any extra commentary or markdown code blocks. Only output the sections as described above.`;
      }

      if (imageData) {
        // Handle both single image and array of images
        const images = Array.isArray(imageData) ? imageData : [imageData];
        const content = [
          { type: 'text', text: userPrompt },
          ...images.map(img => ({ type: 'image_url', image_url: { url: img } }))
        ];
        
        messages.push({
          role: 'user',
          content: content,
        });
      } else {
        messages.push({ role: 'user', content: userPrompt });
      }

      const response = await axios.post(
        `${API_URL}openai/deployments/${DEPLOYMENT_ID}/chat/completions?api-version=2024-02-15-preview`,
        {
          messages: messages,
          temperature: 0.3,
          max_tokens: 1500,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': API_KEY,
          },
          timeout: 30000,
        }
      );

      if (thisToken === latestRequestToken.current) {
        if (response.data && response.data.choices && response.data.choices[0]) {
          const cleanResponse = response.data.choices[0].message.content
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/```/g, '')
            .replace(/`/g, '')
            .trim();
          setAiResponse(cleanResponse);
          setShowRetry(false);
        } else {
          setAiResponse('Received an unexpected response format from the API.');
        }
      }
    } catch (error) {
      if (thisToken === latestRequestToken.current) {
        if (error.response) {
          setAiResponse(`API Error: ${error.response.status} - ${error.response.data?.error?.message || 'Unknown error'}`);
        } else if (error.request) {
          if (retryCount < 2) {
            // Retry after a short delay
            setTimeout(() => {
              sendToOpenAI(prompt, imageData, language, token, retryCount + 1);
            }, 1200);
            return;
          } else {
            setAiResponse('Network error: Unable to reach the API after several attempts. Please check your internet connection, API key, and endpoint.');
            setShowRetry(true);
          }
        } else {
          setAiResponse(`Error: ${error.message}`);
        }
      }
    }
    if (thisToken === latestRequestToken.current) {
      setIsThinking(false);
    }
  };

  const handleRetry = () => {
    setAiResponse('');
    setShowRetry(false);
    sendToOpenAI(lastPrompt, lastImageData, lastLanguage);
  };

  const handleLanguageChange = (event) => {
    setSelectedLanguage(event.target.value);
  };

  const handleSliderChange = (event) => {
    setGlassOpacity(parseFloat(event.target.value));
  };

  const takeScreenshot = async (language) => {
    try {
      let dataUrl;
      if (!window.electron || !window.electron.captureScreen) {
        const element = document.body;
        const canvas = await html2canvas(element);
        dataUrl = canvas.toDataURL('image/png');
      } else {
        dataUrl = await window.electron.captureScreen();
      }
      setScreenshotQueue((prev) => prev.includes(dataUrl) ? prev : [...prev, dataUrl]);
    } catch (error) {
      setAiResponse(`Failed to capture screenshot: ${error.message}`);
    }
  };

  const solveScreenshots = async () => {
    if (screenshotQueue.length === 0) return;
    setIsThinking(true);
    setAiResponse('');
    const newToken = requestToken + 1;
    setRequestToken(newToken);
    latestRequestToken.current = newToken;
    try {
      // Send all screenshots together as one request
      const allScreenshots = [...screenshotQueue];
      let prompt = '';
      if (allScreenshots.length > 1) {
        prompt = `There are ${allScreenshots.length} screenshots that are all part of the same question/problem. Please analyze all images together and provide a comprehensive solution.`;
      }
      await sendToOpenAI(prompt, allScreenshots, selectedLanguage, newToken);
      setScreenshotQueue([]);
    } catch (error) {
      if (newToken === latestRequestToken.current) {
        setAiResponse(`Failed to solve screenshots: ${error.message}`);
      }
    }
    if (newToken === latestRequestToken.current) {
      setIsThinking(false);
    }
  };

  const startOver = () => {
    setTranscript('');
    setAiResponse('');
    setIsThinking(false);
    setScreenshotQueue([]);
    // Invalidate all previous requests
    const newToken = requestToken + 1;
    setRequestToken(newToken);
    latestRequestToken.current = newToken;
    if (isListening) {
      stopRecognition();
    }
  };

  // Helper to parse and render screenshot AI responses attractively
  function renderScreenshotResponse(aiResponse) {
    if (!aiResponse) return null;
    // Split into sections by headings (case-insensitive)
    const sections = {};
    let current = null;
    let buffer = [];
    const lines = aiResponse.split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (/^(comparison|approach|solution|optimized solution|complexity|answer|short explanation)[:：]?/i.test(trimmed)) {
        if (current && buffer.length) {
          sections[current] = buffer.join('\n').trim();
        }
        const heading = trimmed.match(/^(comparison|approach|solution|optimized solution|complexity|answer|short explanation)/i)[0].toLowerCase();
        current = heading;
        buffer = [trimmed.replace(/^(comparison|approach|solution|optimized solution|complexity|answer|short explanation)[:：]?/i, '').trim()];
      } else {
        buffer.push(line);
      }
    });
    if (current && buffer.length) {
      sections[current] = buffer.join('\n').trim();
    }

    // Render sections in order
    const order = [
      'comparison',
      'approach',
      'solution',
      'optimized solution',
      'complexity',
      'answer',
      'short explanation'
    ];
    return (
      <div className="screenshot-response-box">
        {order.map(key => {
          if (key === 'comparison' && sections[key]) {
            // Render comparison as bullets
            const points = sections[key].split(/^-|\n-?|\n\d+\.|\n•|\n|;|\u2022/).filter(Boolean);
            return (
              <div key={key} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 4, letterSpacing: 0.2 }}>
                  Comparison
                </div>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  {points.map((point, idx) => (
                    <li key={idx} style={{ color: '#f8fafd', fontSize: 15, marginBottom: 4, listStyleType: 'disc' }}>{point.trim()}</li>
                  ))}
                </ul>
              </div>
            );
          }
          // If comparison is present, skip approach
          if (key === 'approach' && sections['comparison']) return null;
          if (key === 'approach') {
            return (
              <div key={key} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 4, letterSpacing: 0.2 }}>
                  Approach
                </div>
                {sections[key] ? (
                  <ul style={{ paddingLeft: 20, margin: 0 }}>
                    {sections[key].split(/^-|\n-?|\n\d+\.|\n•|\n/).filter(Boolean).map((point, idx) => (
                      <li key={idx} style={{ color: '#f8fafd', fontSize: 15, marginBottom: 4, listStyleType: 'disc' }}>{point.trim()}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: '#f8fafd', fontSize: 15, fontStyle: 'italic' }}>No approach provided by AI.</div>
                )}
              </div>
            );
          }
          if (key === 'complexity' && sections[key]) {
            // Improved complexity parsing
            const complexityText = sections[key];
            
            // Try to find time complexity
            let timeComplexity = null;
            let spaceComplexity = null;
            
            // Look for explicit "Time Complexity" or "Time:" patterns - include the full label
            const timeMatch = complexityText.match(/((?:time\s*complexity|time)\s*[:：]\s*[^\n\r;]+)/i);
            if (timeMatch) {
              timeComplexity = timeMatch[1].trim();
            }
            
            // Look for explicit "Space Complexity" or "Space:" patterns - include the full label
            const spaceMatch = complexityText.match(/((?:space\s*complexity|space)\s*[:：]\s*[^\n\r;]+)/i);
            if (spaceMatch) {
              spaceComplexity = spaceMatch[1].trim();
            }
            
            // If explicit patterns not found, try to split by common separators
            if (!timeComplexity || !spaceComplexity) {
              const parts = complexityText.split(/[;\n\r]/).filter(part => part.trim());
              
              // Find parts containing time-related keywords
              const timePart = parts.find(part => 
                /time|o\(|big\s*o/i.test(part) && !/space/i.test(part)
              );
              if (timePart && !timeComplexity) {
                timeComplexity = timePart.trim();
              }
              
              // Find parts containing space-related keywords
              const spacePart = parts.find(part => 
                /space|memory/i.test(part) && !/time/i.test(part)
              );
              if (spacePart && !spaceComplexity) {
                spaceComplexity = spacePart.trim();
              }
            }
            
            // Fallback: if still not found, show the full text
            if (!timeComplexity && !spaceComplexity) {
              return (
                <div key={key} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 4, letterSpacing: 0.2 }}>
                    Complexity
                  </div>
                  <div style={{ fontSize: 15, color: '#f8fafd' }}>{complexityText}</div>
                </div>
              );
            }
            
            return (
              <div key={key} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 4, letterSpacing: 0.2 }}>
                  Complexity
                </div>
                <ul style={{ paddingLeft: 20, margin: 0 }}>
                  <li style={{ color: '#f8fafd', fontSize: 15, marginBottom: 4, listStyleType: 'disc' }}>
                    {timeComplexity || 'Time complexity not provided.'}
                  </li>
                  <li style={{ color: '#f8fafd', fontSize: 15, marginBottom: 4, listStyleType: 'disc' }}>
                    {spaceComplexity || 'Space complexity not provided.'}
                  </li>
                </ul>
              </div>
            );
          }
          if ((key === 'solution' || key === 'optimized solution') && sections[key]) {
            return (
              <div key={key} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 4, letterSpacing: 0.2 }}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </div>
                <pre className="solution-block" style={{
                  background: '#23272e',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '14px 18px',
                  fontSize: 13,
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  margin: 0,
                  border: '1px solid #444',
                  fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  whiteSpace: 'pre',
                  wordBreak: 'break-word',
                  boxShadow: '0 2px 12px 0 rgba(25, 118, 210, 0.10)',
                  scrollbarColor: '#1976d2 #23272e',
                  scrollbarWidth: 'thin',
                }}>
                  <code className="code-highlight">{sections[key]}</code>
                </pre>
              </div>
            );
          }
          // Default rendering for other sections
          return sections[key] ? (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#fff', marginBottom: 4, letterSpacing: 0.2 }}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </div>
              <div style={{ fontSize: 15, color: '#f8fafd', background: key === 'answer' ? 'rgba(255,255,255,0.08)' : 'none', borderRadius: 4, padding: key === 'answer' ? '6px 10px' : 0, fontWeight: key === 'answer' ? 600 : 400 }}>{sections[key]}</div>
            </div>
          ) : null;
        })}
      </div>
    );
  }

  return (
    <div className="App">
      <div className="app-title-section" style={{ width: '100%', display: 'flex', alignItems: 'center', marginBottom: 6, marginTop: 2 }}>
        <span style={{
          fontFamily: 'Poppins, Inter, Segoe UI, Arial, sans-serif',
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: 0.8,
          background: 'linear-gradient(90deg, #1976d2 0%, #40b8cb 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          display: 'inline-block',
          textShadow: '0 1px 6px rgba(25, 118, 210, 0.10)',
          marginLeft: 4,
        }}>
          CrackMate
        </span>
      </div>
      <div className="top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            variant={'outlined'}
            color="primary"
            size="small"
            onClick={isSolvingScreenshots ? undefined : (isListening ? stopRecognition : startRecognition)}
            disabled={isThinking || isSolvingScreenshots}
            sx={{
              minWidth: 90,
              height: 32,
              fontWeight: 600,
              fontSize: 14,
              borderRadius: 2,
              boxShadow: 0,
              textTransform: 'none',
              letterSpacing: 0.2,
              background: isSolvingScreenshots ? 'linear-gradient(90deg, #f7971e 0%, #ffd200 100%)' : '#fff',
              color: isSolvingScreenshots ? '#333' : '#1976d2',
              border: isSolvingScreenshots ? '1.5px solid #ffd200' : '1px solid #1976d2',
              opacity: isThinking || isSolvingScreenshots ? 0.7 : 1,
              cursor: isThinking || isSolvingScreenshots ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
            }}
          >
            {isSolvingScreenshots ? 'Wait...' : isListening ? 'Stop' : 'Start'}
          </Button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flex: 1 }}>
          {/* Upload Resume Button (only show if not uploaded) */}
          {!resumeUploaded && !isUploadingResume && (
            <Button
              component="label"
              variant="contained"
              color="primary"
              size="small"
              startIcon={<CloudUploadIcon />}
              sx={{ minWidth: 110, height: 32, fontWeight: 600, fontSize: 14, borderRadius: 2, boxShadow: 0, textTransform: 'none', letterSpacing: 0.2, background: '#fff', color: '#1976d2', border: '1px solid #1976d2' }}
            >
              Upload Resume
              <VisuallyHiddenInput
                type="file"
                accept=".pdf"
                onChange={handleResumeUpload}
              />
            </Button>
          )}
          {isUploadingResume && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CircularProgress size={18} color="primary" />
              <span style={{ color: '#1976d2', fontWeight: 500, fontSize: 14 }}>Uploading...</span>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            className="shortcuts-container"
            onMouseEnter={() => setIsShortcutsHovered(true)}
            onMouseLeave={() => setIsShortcutsHovered(false)}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <span className="shortcuts-icon"><KeyboardIcon style={{ fontSize: 28, cursor: 'pointer' }} /></span>
            {isShortcutsHovered && (
              <div className="settings-content shortcuts-content" ref={shortcutsRef} style={{ position: 'absolute', right: 48, top: 60, zIndex: 1000 }}>
                <p className="title">Keyboard Shortcuts</p>
                <div className="shortcut-item">
                  <div className="shortcut-title">
                    Take Screenshot <span className="key-combo">Ctrl + H</span>
                  </div>
                  <p className="shortcut-description">Capture the problem description as a screenshot.</p>
                </div>
                <div className="shortcut-item">
                  <div className="shortcut-title">
                    Start Over <span className="key-combo">Ctrl + G</span>
                  </div>
                  <p className="shortcut-description">Reset and start a new session.</p>
                </div>
                <div className="shortcut-item">
                  <div className="shortcut-title">
                    Move Window <span className="key-combo">Ctrl + Arrow Keys</span>
                  </div>
                  <p className="shortcut-description">Reposition the window using arrow keys.</p>
                </div>
                <div className="shortcut-item">
                  <div className="shortcut-title">
                    Toggle App Visibility <span className="key-combo">Ctrl + .</span>
                  </div>
                  <p className="shortcut-description">Show or hide the app window.</p>
                </div>
                <div className="shortcut-item">
                  <div className="shortcut-title">
                    Quit App <span className="key-combo">Ctrl + Q</span>
                  </div>
                  <p className="shortcut-description">Exit the application.</p>
                </div>
                <div className="shortcut-item">
                  <div className="shortcut-title">
                    Solve Screenshots <span className="key-combo">Ctrl + Enter</span>
                  </div>
                  <p className="shortcut-description">Send all captured screenshots for AI solution.</p>
                </div>
              </div>
            )}
          </div>
          <div
            className="settings-container"
            onMouseEnter={() => setIsSettingsHovered(true)}
            onMouseLeave={() => setIsSettingsHovered(false)}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <span className="settings-icon">⚙️</span>
            {isSettingsHovered && (
              <div className="settings-content" ref={settingsRef}>
                <div className="language-section" style={{ marginTop: 16, marginBottom: 8 }}>
                  <p className="title" style={{ color: '#1976d2', fontWeight: 700 }}>Language:</p>
                  <div className="language-choice-group">
                    {['Python', 'Java', 'C++'].map(lang => (
                      <Button
                        key={lang}
                        variant={selectedLanguage === lang ? 'contained' : 'outlined'}
                        color="primary"
                        size="small"
                        onClick={() => setSelectedLanguage(lang)}
                        sx={{
                          background: selectedLanguage === lang ? '#1976d2' : '#fff',
                          color: selectedLanguage === lang ? '#fff' : '#1976d2',
                          borderColor: '#1976d2',
                          fontWeight: 600,
                          borderRadius: 2,
                          minWidth: 60,
                          height: 32,
                          boxShadow: 0,
                          textTransform: 'none',
                          fontSize: 14,
                          letterSpacing: 0.2,
                        }}
                      >
                        {lang}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="slider-section">
                  <p className="title">Glass Opacity</p>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={glassOpacity}
                    onChange={handleSliderChange}
                    className="slider"
                  />
                  <span className="opacity-value">{Math.round(glassOpacity * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="content-area" style={{ paddingRight: '8px', marginBottom: '10px', overflow: 'visible', width: '100%' }}>
        {isListening && (
          <p className="listening-indicator">🎤 Listening... Speak now!</p>
        )}
        {transcript && !isListening && (
          <p className="result"><strong>You said:</strong> {transcript}</p>
        )}
        {isThinking && !isSolvingScreenshots && !screenshotQueue.length && (
          <div className="loading-container">
            <div className="loading-spinner">
              <CircularProgress size={24} color="primary" />
            </div>
            <div className="loading-text">
              <span className="loading-title">Processing your request...</span>
              <span className="loading-subtitle">Analyzing and generating response</span>
            </div>
          </div>
        )}
        {aiResponse && !isThinking && (
          <>
            {/* If the last action was screenshot solving, render attractively */}
            {isSolvingScreenshots === false && lastImageData ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1976d2', marginBottom: 8 }}>AI ({selectedLanguage}):</div>
                {renderScreenshotResponse(aiResponse)}
              </div>
            ) : (
              <p className="response"><strong>AI ({selectedLanguage}):</strong> {aiResponse}</p>
            )}
            {showRetry && (
              <button onClick={handleRetry} style={{
                marginTop: 10,
                padding: '8px 18px',
                background: '#1976d2',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(25,118,210,0.08)'
              }}>
                Retry
              </button>
            )}
          </>
        )}
      </div>

      {screenshotQueue.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            {screenshotQueue.map((img, idx) => (
              <img key={idx} src={img} alt={`Screenshot ${idx + 1}`} style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #ccc' }} />
            ))}
          </div>
        </div>
      )}

      {isSolvingScreenshots && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
          <CircularProgress size={20} color="primary" />
          <span style={{ color: '#1976d2', fontWeight: 500, fontSize: 14 }}>Solving problem...</span>
        </div>
      )}

      <style>{`
        .settings-content .shortcut-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
          font-weight: 600;
          color: #1976d2;
        }
        .settings-content .key-combo {
          margin-left: 16px;
          color: #1976d2;
          font-weight: 600;
          // font-size: 12px;
          background: #e3f2fd;
          border-radius: 4px;
          padding: 2px 8px;
          text-align: right;
          display: inline-block;
        }
        .settings-content .shortcut-description {
          color: #555;
          font-size: 11px;
          margin-left: 0;
        }
        .settings-content .shortcut-item {
          margin-bottom: 10px;
        }
        .settings-content .title {
          color: #1976d2;
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .screenshot-response-box {
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .solution-block {
          white-space: pre-wrap;
          word-break: break-all;
        }
        .solution-block::-webkit-scrollbar {
          height: 6px;
        }
        .solution-block::-webkit-scrollbar-thumb {
          background: #1976d2;
          border-radius: 3px;
        }
        .solution-block::-webkit-scrollbar-track {
          background: #23272e;
        }
        .solution-block {
          scrollbar-width: thin;
          scrollbar-color: #1976d2 #23272e;
        }
      `}</style>
    </div>
  );
};

export default App;