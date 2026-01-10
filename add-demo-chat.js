const fs = require('fs');
let content = fs.readFileSync('app/cases/page.tsx', 'utf8');

// Add demo responses function
const demoFunc = `
 // Demo patient responses (when no API key)
 const getDemoPatientResponse = (question: string): string => {
 const q = question.toLowerCase();
 if (q.includes('болка') || q.includes('боли')) {
 return 'Да, много ме боли... тук, в гърдите. Стяга ме, като че ли някой ме притиска. Започна преди около 2 часа.';
 }
 if (q.includes('пуш') || q.includes('цигар')) {
 return 'Да, пуша от много години... по кутия на ден. Знам, че трябва да спра, но е трудно.';
 }
 if (q.includes('лекарства') || q.includes('приемате')) {
 return 'Имам хапчета за кръвно, ама... не ги пия редовно. Понякога забравям.';
 }
 if (q.includes('фамил') || q.includes('родител') || q.includes('баща') || q.includes('майка')) {
 return 'Баща ми почина от инфаркт на 55 години... Майка ми е жива, има високо кръвно.';
 }
 if (q.includes('диабет') || q.includes('захар')) {
 return 'Да, имам захар от няколко години. Лекарят каза, че трябва да внимавам с храната.';
 }
 if (q.includes('кръвно') || q.includes('хипертон') || q.includes('налягане')) {
 return 'Да, имам високо кръвно от около 10 години. Понякога стига до 160-170.';
 }
 if (q.includes('ръка') || q.includes('разпростран')) {
 return 'Да, болката отива към лявата ми ръка... чак до лакътя. И малко изтръпва.';
 }
 if (q.includes('потя') || q.includes('изпотя') || q.includes('пот')) {
 return 'Да, много се изпотих... цялата риза ми е мокра. И ми е студено някак.';
 }
 if (q.includes('дишане') || q.includes('задух') || q.includes('въздух') || q.includes('диша')) {
 return 'Малко ми е трудно да дишам... не мога да поема дълбоко въздух.';
 }
 if (q.includes('гаде') || q.includes('повръщ')) {
 return 'Да, малко ми се гади... но не съм повръщал.';
 }
 return 'Не съм сигурен какво питате, докторе. Може ли да обясните?';
 };

`;

// Add before "// Handle patient response"
content = content.replace(
  ' // Handle patient response in history',
  demoFunc + ' // Handle patient response in history'
);

// Update the function to use demo mode
content = content.replace(
  'if (!activeCase || !historyInput.trim() || !apiKey) return;',
  'if (!activeCase || !historyInput.trim()) return;'
);

// Find and replace the try block
const oldTry = `try {
 const response = await fetch('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 apiKey,
 mode: 'patient_response',
 caseContext: JSON.stringify(activeCase.hiddenData),
 conversationHistory: [...activeCase.historyMessages, newMessage],
 studentQuestion: historyInput,
 presentation: activeCase.presentation
 })
 });

 const result = await response.json();
 if (!response.ok) throw new Error(result.error);

 incrementApiCalls(result.usage?.cost || 0);

 const patientMessage: CaseMessage = {
 id: (Date.now() + 1).toString(),
 role: 'patient',
 content: result.response,
 timestamp: new Date().toISOString()
 };

 setActiveCase(prev => prev ? {
 ...prev,
 historyMessages: [...prev.historyMessages, patientMessage]
 } : null);
 }`;

const newTry = `try {
 let patientResponseText: string;
 const isDemo = activeCase.subjectId === 'demo';

 if (!apiKey || isDemo) {
 // Demo mode - use hardcoded responses
 await new Promise(r => setTimeout(r, 800));
 patientResponseText = getDemoPatientResponse(historyInput);
 } else {
 // Real API call
 const response = await fetch('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 apiKey,
 mode: 'patient_response',
 caseContext: JSON.stringify(activeCase.hiddenData),
 conversationHistory: [...activeCase.historyMessages, newMessage],
 studentQuestion: historyInput,
 presentation: activeCase.presentation
 })
 });

 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(errorText || 'API грешка');
 }

 const result = await response.json();
 patientResponseText = result.response;
 incrementApiCalls(result.usage?.cost || 0);
 }

 const patientMessage: CaseMessage = {
 id: (Date.now() + 1).toString(),
 role: 'patient',
 content: patientResponseText,
 timestamp: new Date().toISOString()
 };

 setActiveCase(prev => prev ? {
 ...prev,
 historyMessages: [...prev.historyMessages, patientMessage]
 } : null);
 }`;

content = content.replace(oldTry, newTry);

fs.writeFileSync('app/cases/page.tsx', content);
console.log('Demo chat added!');
