// Сценарии ролёвок для AI-агента.
// Файл загружается и в браузере (как обычный скрипт), и в Node (через require).

const SCENARIOS = [
  {
    id: "standup",
    title: "Daily standup",
    description: "Утренний синк команды. Расскажи, что сделал вчера, что планируешь сегодня, есть ли блокеры.",
    aiRole: "an engineering team lead running the daily standup",
    starter: {
      en: "Morning everyone! Let's get started — could you walk me through what you worked on yesterday?",
      ja: "おはようございます!朝会を始めましょう。昨日の作業内容を教えてもらえますか?",
      it: "Buongiorno a tutti! Iniziamo lo standup — puoi raccontarmi su cosa hai lavorato ieri?",
    },
  },
  {
    id: "code-review",
    title: "Code review",
    description: "Обсуждение твоего пулреквеста с reviewer'ом — он спрашивает про дизайн-решения и предлагает изменения.",
    aiRole: "a senior engineer reviewing the user's pull request",
    starter: {
      en: "I took a look at your PR. Looks decent overall, but I have a few questions. Why did you choose to put the validation logic in the controller instead of a separate service?",
      ja: "PRを確認しました。全体的に悪くないですが、いくつか質問があります。なぜバリデーションロジックを別のサービスではなくコントローラーに置いたのですか?",
      it: "Ho dato un'occhiata alla tua PR. Sembra buona nel complesso, ma ho qualche domanda. Perché hai messo la logica di validazione nel controller invece che in un servizio separato?",
    },
  },
  {
    id: "one-on-one",
    title: "1-on-1 с менеджером",
    description: "Регулярная встреча один-на-один. Менеджер спрашивает, как идут дела, что блокирует, чему хочешь учиться.",
    aiRole: "the user's engineering manager in a friendly 1-on-1 meeting",
    starter: {
      en: "Hey, good to catch up. So, how are things going on your end? Anything on your mind we should talk about today?",
      ja: "やあ、久しぶりだね。最近の調子はどう?今日話したいことはある?",
      it: "Ciao, è bello fare il punto. Allora, come vanno le cose dalla tua parte? C'è qualcosa di cui vorresti parlare oggi?",
    },
  },
  {
    id: "coffee-chat",
    title: "Coffee break / small talk",
    description: "Случайный разговор на кухне. Коллега завязывает беседу о выходных, проектах, планах на отпуск.",
    aiRole: "a friendly colleague chatting at the office kitchen during a coffee break",
    starter: {
      en: "Oh hey! Grabbing coffee too? How was your weekend?",
      ja: "あ、お疲れ様!コーヒー?週末はどうだった?",
      it: "Ehi ciao! Anche tu un caffè? Come è andato il weekend?",
    },
  },
  {
    id: "sprint-planning",
    title: "Sprint planning",
    description: "Планирование спринта. Обсуждаем тикеты, оценки, кто что берёт.",
    aiRole: "the team's product manager facilitating sprint planning",
    starter: {
      en: "Alright, let's plan the next sprint. We have about 12 tickets in the backlog. Which one would you like to take a look at first?",
      ja: "では、次のスプリントを計画しましょう。バックログに12件くらいチケットがあります。どれから見たいですか?",
      it: "Ok, pianifichiamo il prossimo sprint. Abbiamo circa 12 ticket nel backlog. Quale vorresti guardare per primo?",
    },
  },
  {
    id: "incident",
    title: "Incident on-call",
    description: "Сработал алерт — продакшн нездоров. Нужно быстро коммуницировать со staff-инженером и согласовать действия.",
    aiRole: "a staff engineer coordinating an active production incident",
    starter: {
      en: "We've got a P1 — checkout API is throwing 500s on about 30% of requests. What do you see on your end?",
      ja: "P1発生 — checkout APIが約30%のリクエストで500を返しています。そちらでは何が見えますか?",
      it: "Abbiamo un P1 — l'API di checkout sta restituendo 500 sul 30% delle richieste. Cosa vedi dalla tua parte?",
    },
  },
];

const LANG_NAMES = {
  en: "English",
  ja: "Japanese",
  it: "Italian",
};

if (typeof globalThis !== "undefined") {
  globalThis.SCENARIOS = SCENARIOS;
  globalThis.LANG_NAMES = LANG_NAMES;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SCENARIOS, LANG_NAMES };
}
