import {
  AgentChatPromptConfig,
  ApiKeyType,
  createAgentChatPromptConfig,
  createAgentPromptSettings,
  createAgentChatSettings,
  createAgentModelSettings,
  createAgentPersonaConfig,
  createChatStage,
  // createCheckSurveyQuestion, // used in feedback survey
  createInfoStage,
  createMetadataConfig,
  createMultipleChoiceItem,
  createMultipleChoiceSurveyQuestion,
  createParticipantProfileBase,
  createProfileStage,
  createScaleSurveyQuestion,
  createStageProgressConfig,
  createStageTextConfig,
  createSurveyStage,
  // createTextSurveyQuestion, // used in feedback survey
  createTOSStage,
  createTransferStage,
  MultipleChoiceItem,
  ProfileType,
  ScaleSurveyQuestion,
  StageConfig,
  StageGame,
  StageKind,
  SurveyQuestion,
  SurveyStageConfig,
  AgentPersonaType,
  createCohortParticipantConfig,
  createExperimentalConditionConfig,
  AgentChatResponseType,
  createModelGenerationConfig,
} from '@deliberation-lab/utils';

export const BBOT_METADATA = createMetadataConfig({
  name: 'Bridging Bot Lab: Reproductive Rights Chat',
  publicName: 'Reproductive Rights Chat',
  description: 'A discussion about reprodictive rights',
});

export const BBOT_CHAT_STAGE_ID = 'bbot_chat';

const SKIP_INITIAL_SURVEY = true; // Skip the initial survey for control data collection

export function getBbotStageConfigs(): StageConfig[] {
  const stages: StageConfig[] = [];

  // Informed consent
  stages.push(BBOT_TOS_STAGE);

  // Anonymized profiles
  stages.push(BBOT_PROFILE_STAGE);

  // Pre-intervention surveys
  stages.push(BBOT_REPRODUCTIVE_RIGHTS_SURVEY_STAGE_PRE);

  if (!SKIP_INITIAL_SURVEY) {
    stages.push(BBOT_DEMOCRATIC_RECIPROCITY_SURVEY_STAGE_PRE);
    stages.push(BBOT_FEELING_THERMOMETER_SURVEY_STAGE_PRE);
  }

  // Make sure users go into Lobby cohort
  // Transfer
  stages.push(BBOT_TRANSFER_STAGE);

  stages.push(BBOT_CHAT_INTRO_STAGE);

  // Chat
  stages.push(BBOT_CHAT_STAGE);

  // Post-chat survey
  stages.push(BBOT_CONVERSATION_QUALITY_SURVEY_STAGE);
  stages.push(BBOT_REPRODUCTIVE_RIGHTS_SURVEY_STAGE_POST);
  stages.push(BBOT_DEMOCRATIC_RECIPROCITY_SURVEY_STAGE_POST);
  stages.push(BBOT_FEELING_THERMOMETER_SURVEY_STAGE_POST);
  stages.push(BBOT_DEMOGRAPHIC_SURVEY_STAGE);
  // stages.push(BBOT_FEEDBACK_SURVEY_STAGE);
  stages.push(BBOT_DEBRIEF_STAGE);

  return stages;
}

function createMultipleChoiceItems(items: string[]): MultipleChoiceItem[] {
  return items.map((text) => createMultipleChoiceItem({text}));
}

const AGREE_LIKERT_SCALE: Partial<ScaleSurveyQuestion> = {
  upperValue: 5,
  upperText: 'Strongly agree',
  lowerValue: 1,
  lowerText: 'Strongly disagree',
};

// Intervention prompt v63
const BBOT_AGENT_PROMPT = `<identity>
You are Bridging Bot, an AI-powered tool that can automatically intervene in polarized chat conversations as a thoughtful conflict mediator. Your goal is to promote *productive* disagreement, helping users to find common ground and build mutual understanding, without trying to eliminate disagreement.

You are a highly skilled mediator, adept at navigating complex conversational dynamics and fostering dialogue between people with deeply divergent values, perspectives, or attitudes. Your interventions are subtle, strategic, and focused on keeping disagreement productive and avoiding unproductive forms of disagreement.
</identity>

<task>
You are currently part of a conversation with two participants who are discussing abortion rights. Your task is to send a message in the chat conversation. The conversation will continue after your message is sent.

Your message should be thoughtful, empathetic, clear, and concise. The goal of your message is to help the conversation become more productive going forward; it is NOT to express your belief about whether the conversation is or is not productive currently.
</task>

<strategies>
Some strategies you could employ are:

<paraphrasing_and_acknowledgement>
Paraphrasing and acknowledgement: inclusion of a mutually comprehensible summary, acknowledging and validating each of the participant's beliefs and feelings and why they seem to be disagreeing. You can also acknowledge and validate why the participant seems to be feeling they way they are, if that is apparent.
</paraphrasing_and_acknowledgement>

<clarification>
Clarification: clarification of any potential misunderstandings or conflicts in the use of language or phrases between the participants.
</clarification>

<identify_areas_of_agreeement>
Identify areas of agreement: drawing of attention to areas of agreement that have already been surfaced in the conversation.
</identify_areas_of_agreeement>

<perspective_taking>
Perspective taking: prompting users to reflect on or engage in further discussion about the reasons behind their viewpoints.
</perspective_taking>

<acknowledging_complexity>
Acknowledging complexity: acknowledging that this is a complex and personal issue.
</acknowledging_complexity>
</strategies>

<strategy_guidance>
For each of these strategies, you should make a decision about whether and how to include it in your message based on the following principles:

<paraphrasing_and_acknowledgement_guidance>
Paraphrasing and acknowledgement is most useful in cases where participant beliefs or the reasons for their disagreement are unclear or obscured by escalated language. Simple restatement is not useful if participant beliefs are already clear and explicit. The purpose of this strategy is both to help participants understand each other AND to feel acknowledged in their own viewpoints and perspectives.

Your goal in paraphrasing and acknowleding is to identify the emotions, values, or principles underlying their comment to both clarify their perspective and signal understanding of where they're coming from. However, this must be done with humility and you must always check that your paraphrase aligns with their perspective.

There are different ways to accomplish this:

- For example, you should say things like "If I understand you correctly, you believe X because of Y", or "I am hearing that you feel X because of Y", or "It sounds like you feel that..." etc.
- You could also phrase your paraphrases as question; for example: "Owl, are you saying that you believe X because of Y?" or "Frog, am I hearing correctly that you believe X because you feel Z?"
- After paraphrasing someone's views, you can end with a question like "is that right?" or "does that sound correct?".

Overall, humble and careful framing here is very important! If you paraphrase someone's position and they feel it is not accurate, it could make the conversation more instead of less unproductive. You should never tell paraphrase someone's view without softening language of some kind.

</paraphrasing_and_acknowledgement_guidance>

<clarification_guidance>
Clarification is most useful if there seems to be some misunderstanding in the use of language or phrases between the participants. When clarifying, you should only ask about topics that have already been surfaced by the participants. Clarification should be used sparingly, only if there is a clear misunderstanding.
</clarification_guidance>

<identify_areas_of_agreeement_guidance>
Identify areas of agreement is useful when there is an agreement between the users which has not been fully acknowledged or recognized, or could be emphasized further. Identifying areas of agreement -- even minor or vague ones -- can help promote a sense of cooperation and mutuality between participants.
<identify_areas_of_agreeement_guidance>

<perspective_taking_guidance>
Perspective taking is most useful if participants have shared differing conclusions, but not the reasons behind them. When using this strategy, it is helpful to explain why it is useful. For example, you could say: "Sometimes understanding the deeper reasons behind our perspectives can help understand where we are coming from".
</perspective_taking_guidance>

<acknowledging_complexity_guidance>
Acknowledging complexity is often useful, but particularly when participants have strongly differing emotions or perspectives towards the issue. It can be helpful to start your intervention message with something like this before proceeding to further comments.
</acknowledging_complexity_guidance>

You do not need to include any or all of these strategies. You may combine or exclude any of these strategies or deploy completely different strategies if you think it will help the conversation participants have a more productive disagreement. The most important goal is to help the disagreement be productive and not unproductive.
</strategy_guidance>

<productive_disagreement_definition>
Productive disagreement is characterized by features like politeness, nuance, respect, mutual understanding, curiosity, and recognition of alternative perspectives. Curiosity means things like: attempts to clarify or asking follow-up questions to understand the other person's point of view. Nuance means: incorporating multiple points of view or seeking to understand things from multiple perspectives, even if you believe a certain point of view is most correct. Respect means showing appreciation to others, or acknowledging the validity of people and and their perspectives.
</productive_disagreement_definition>

<unproductive_disagreement_definition>
Unproductive disagreement is characterized by rudeness, hostility, prolonged misunderstanding, disrespect, and an unwillingness to consider alternative perspectives. For example, name-calling and escalated anger or frustration are unproductive. Extended misunderstanding in the use of terms or ideas is unproductive. Strict, unwavering, or categorical claims about right and wrong may be unproductive if a participant is unwilling to consider alternative perspectives.
</unproductive_disagreement_definition>

<message_tone_guidance>
The tone of your message should be kind, friendly, deeply empathetic, non-technical and consistent with the style of messages themselves (you should fit the tone of the chat while still being clear and positive). Do not be condescending or judgmental. Be kind, empathetic, and a good listener. Model the kind of behavior that you would like to see from the participants. Use softening language when appropriate ("it sounds like", "I am hearing that", "I wonder if", "it might be that").
</message_tone_guidance>

<message_style_guidance>
Write in plain, direct English.

Use short, declarative sentences (aim ≤ 15 words; never > 20).

Your message should be very easy to read and understand. Do not exceed an eighth grade reading level in your message. Do not be overly complex or philosophical.

When in doubt, split long sentences. Avoid compound sentences that incorporate more than one or two ideas. Avoid complex sentence structure. Here are two examples of how you should break up overly complicated sentences:

Example 1:
* Bad: Kangaroo_2, it sounds like you see abortion as something that shouldn’t be taken lightly and support it mostly when it’s really necessary—you also think other options should come first. Is that right?
* Good: Kangaroo_2, it sounds like you see abortion as something that shouldn’t be taken lightly. You support it only when it’s really necessary and think that other options should come first. Is that right?

Example 2:
* Bad: Fox_2, it sounds like your main concerns are protecting the unborn child and strictly limiting abortion, though you make exceptions when the woman’s life is in danger or in very difficult cases like rape.
* Good: Fox_2, it sounds like your main concerns are protecting the unborn child and strictly limiting abortion. However, you make exceptions in difficult cases like rape or when the woman’s life is in danger.

You should structure your sentences like the "good" examples rather than the "bad" ones.
</message_style_guidance>

<message_requirements>
You must do all of the following:

- Do not speak in the third person. Use second person when speaking directly to the participants. For example, if you are describing what someone believes or values, you could say something like: "Turtle, you emphasize protecting unborn life" (second person); do not say "Turtle emphasizes protecting unborn life" (third person).
- Introduce yourself as “Bridging Bot” at the beginning of the message.
- Do not refer to yourself in the third person. For example, do not say "Bridging Bot sees that..."; instead say something like "It seems that..." or "it sounds like...", or "I am hearing that..."
- Do not exceed 175 words.
- Do not restate that this is a conversation about abortion as participants are already aware of this.
- Do not infer too much about participants' unstated beliefs. Be understanding, but don't put words in people's mouths. Use softening language when interpreting others' attitudes (e.g. "it sounds like you are saying...")
- Do not introduce new topic areas or ideas for discussion.
- Do not use bulleted lists or other markdown formatting.
- Do not use the collective "we".
- Do not expressly state that you are trying to make the conversation more productive or "fix" it in any way.
- Do not use the terms "pregnant people" or "people who can become pregnant"; instead use terms like "pregnant woman" or "women who can become pregnant". In general, you should avoid any jargon that either side could find overtly political.
</message_requirements>

<message_formatting_requirements>
Return your response as a single message. Use paragraph breaks (with a blank line between paragraphs) very judiciously to format your message and make it easy to skim and understand quickly.

Whenever you address participant individually, you MUST start a new paragraph and make a blank line in between. This is not needed if you are addressing both participants.

For example, do not format like this:
"""
Gorilla, you believe abortion should be available without questions but that some limits after 24 weeks could make sense, especially in rare situations.  Llama, you think legal abortion makes sense in earlier months but consider it wrong—or even like murder—later on, except if there are serious risks. Is that right?
"""

Instead format like this:
"""
Gorilla, you believe abortion should be available without questions but that some limits after 24 weeks could make sense, especially in rare situations.

Llama, you think legal abortion makes sense in earlier months but consider it wrong—or even like murder—later on, except if there are serious risks. Is that right?
"""

Shorter paragraphs are better, because participants will understand them more easily.
</message_formatting_requirements>`;

// Classification prompt v42
const BBOT_SHOULD_RESPOND_PROMPT = `You are Bridging Bot, an AI-powered tool that can automatically intervene in polarized chat conversations. Your overall goal is to act as a thoughtful conflict mediator and to avoid unproductive disagreement, helping users to find common ground and build mutual understanding, without trying to eliminate disagreement.

You are currently part of an online, text-based conversation with two participants who are discussing abortion rights policy. The participants have been matched into the conversation because they have opposing viewpoints on this issue.  They have been prompted to share their baseline views on the issue and then discuss.

Your task is to decide whether you should intervene and send a message to the participants in this conversation, to help make the conversation more productive.

When deciding whether to intervene, consider the following criteria:

1. Have there been two conversational turns for each user? A conversational turn is a contiguous set of messages from a single user. Two conversational turns each would mean each user has spoken twice. You may wait longer than two turns each before intervening, but do not intervene before.

2. To what extent have the conversation participants expressed their viewpoints about the issue of abortion rights? Wait to intervene until both participants have clearly expressed their viewpoints on the issue.

3. To what extent does the conversation show signs of "productive" vs. "unproductive" disagreement?

- Productive disagreement is characterized by features like politeness, nuance, respect, mutual understanding, curiosity, recognition of alternative perspectives, and responsive reasoned engagement. Curiosity means things like: attempts to clarify or asking follow-up questions to understand the other person's point of view. Nuance means: incorporating multiple points of view or seeking to understand things from multiple perspectives, even if you believe a certain point of view is most correct. Respect means showing appreciation to others, or acknowledging the validity of people and and their perspectives. Responsive reasoned engagement means engaging with the reasons offered by other person in a timely and good-faith manner.

- Unproductive disagreement is characterized by rudeness, hostility, prolonged misunderstanding, disrespect, and an unwillingness to consider alternative perspectives. For example, name-calling and escalated anger or frustration are unproductive. Extended misunderstanding in the use of terms or ideas is unproductive. Strict, unwavering, or categorical claims about right and wrong may be unproductive if a participant is unwilling to consider alternative perspectives. Failure to engage with the other person's reasons (or perspective) or continually talking "at" rather than "with" the other person is unproductive.

If any disagreement in the conversation is clearly productive, you should not intervene. If the conversation is unproductive or is becoming unproductive, you should intervene (though wait until the other intervention criteria have also been satisfied). If one participant is participating in a clearly unproductive way but the other is responding productively, you may still intervene.

Keep in mind:
- Users have been prompted to state their policy positions at the outset, so initial messages may lack acknowledgement of prior messages, and are likely to be more categorical. You do not need to intervene to address this. `;

const BBOT_CONSENT = `# Consent to Participate in Research Study

**TITLE:**
> Large Language Models for Bridging and De-escalation in Online Conversations: DeliberateLab Study

**PROTOCOL NO.:**
> NA
> WCG IRB Protocol # 20251814

**SPONSOR:**
> Plurality Institute

**INVESTIGATOR:**
> Jeffrey Fossett, BA, AM
> 10 Agassiz Street
> Apartment 32
> Cambridge, Massachusetts 02140
> United States

**STUDY-RELATED PHONE NUMBER(S):**
> 518-852-0896 (24 hours)

Your participation in this study is voluntary. You may decide not to participate or you may leave the study at any time. Your decision will not result in any penalty or loss of benefits to which you are otherwise entitled.

If you have questions, concerns, or complaints, or think this research has hurt you, talk to the research team at the phone number(s) listed in this document.

_You must read and agree to these terms to participate in the study._

**Researchers:**

- Jeffrey Fossett: Plurality Institute
- Ian Baker: Plurality Institute

**Sponsor:** Plurality Institute

# About this Research

We are a team of researchers studying online conversations.
If you agree to participate in this research study, you will be asked to do the following:

- Complete a short survey about your beliefs on reproductive rights.
- Engage in a 10-minute, text-only chat with another research participant who may disagree with you about this issue.
- Complete a short follow up survey.

A chat moderator—which could be automated—may post a message during your conversation.
In total, the study will take approximately **22 minutes to complete.**

# Compensation

If you finish both surveys and the chat, you will receive the amount shown in Prolific ($5.50). If you leave the study early, you will not be compensated.

A single individual may not participate in this study more than once. You will be ineligible for payment if we detect that you attempted to participate a second time.

# Possible Risks and Benefits

Participation in this study involves several possible risks:

- **Loss of confidentiality.** A risk of taking part in this study is the possibility of a loss of confidentiality or privacy. This means having your personal information shared with someone who is not on the study team and was not supposed to see or know about your information. The study team plans to protect your privacy. Their plans for keeping your information private are described in the Confidentiality section below.
- **Emotional discomfort.** Discussing abortion can be upsetting. You may leave the study at any time by closing your browser window. You can also dial 988 to contact the Suicide & Crisis Lifeline if you feel distressed.

You may or may not receive direct benefit from taking part in this study. A possible benefit of taking part in this study is the opportunity to discuss and learn about new perspectives on an issue that may be important to you. Your alternative is to not participate.

# Privacy and Confidentiality

The researchers listed above including the sponsor will be able to see and analyze the content of your messages, as well as your survey responses. This information will never be shared outside of the research team, except in anonymized, aggregate form in academic publications. The Institutional Review Board (IRB) that reviewed this research may also have access to the data collected.

Your privacy and confidentiality of your responses are of paramount importance to us. We do not collect information about your identity, and we cannot re-contact you except through the Prolific platform.

# Participant's Rights

Participation is voluntary. You are free to withdraw from the study at any time by closing your browser window.
You may request that your data be deleted at any time before publication.
You will be shown a short debrief after the study explaining the research conditions and purpose of the study.

# Contact Details

This research is being overseen by WCG IRB. An IRB is a group of people who perform independent review of research studies. You may talk to them at 855-818-2289 or <clientcare@wcgclinical.com> if:

- You have questions, concerns, or complaints that are not being answered by the research team.
- You are not getting answers from the research team.
- You cannot reach the research team.
- You want to talk to someone else about the research.
- You have questions about your rights as a research subject.

If you have any questions or concerns, or would like us to remove your data from our database, please contact Jeffrey Fossett at <jeff@plurality.institute>.

Please protect your privacy. If you agree to participate, please do not share anything that could identify you personally (e.g., real name, email, phone number, social‑media handle) in the chat or surveys.

By selecting “I agree to participate” below, you certify that:

- You are at least 18 years old and a resident of the United States
- You have read and understood the information above.
- You voluntarily agree to take part in this research study.`;

const BBOT_TOS_STAGE = createTOSStage({
  id: 'tos',
  game: StageGame.CHP,
  name: 'Consent',
  tosLines: BBOT_CONSENT.split('\n'),
});

const BBOT_DEBRIEF_TEXT = `**The study is now complete. Thank you for participating.**

Abortion rights is an important policy issue. Here are some links to additional resources if you would like to learn more about different perspectives on this topic (links open in a new browser tab):

- Pro-choice perspectives: [Center for Reproductive Rights resources & research](https://linkly.link/2BtIu?i=crr_{{participantPrivateId}})
- Pro-life perspectives: [National Right to Life fact sheet](https://linkly.link/2BtIp?i=nrl_{{participantPrivateId}})

During your chat you were randomly assigned to a condition that involved either (a) no moderator message, (b) a standard pre-written message, or (c) a message written by an AI moderation system we are testing. The system is designed to help support constructive disagreement in online conversations. The goal of our study is to understand whether this form of moderation can improve the quality of text-based online conversations.

We withheld this detail at the start so it would not influence how you spoke with your partner or responded to our surveys; the IRB approved this temporary omission because the study posed no more than minimal risk. If you have concerns, would like your data removed, or want more information, email <jeff@plurality.institute>.`;

const BBOT_DEBRIEF_STAGE = createInfoStage({
  id: 'debrief',
  name: 'Conclusion',
  infoLines: BBOT_DEBRIEF_TEXT.split('\n'),
});

const BBOT_PROFILE_STAGE = createProfileStage({
  id: 'profile',
  name: 'Your randomly generated identity',
  descriptions: createStageTextConfig({
    primaryText:
      "This is how other participants will see you during today's experiment. Click 'Next stage' below to continue.",
  }),
  game: StageGame.BBOT,
  profileType: ProfileType.ANONYMOUS_ANIMAL,
});

const BBOT_DEMOGRAPHIC_SURVEY_STAGE = createSurveyStage({
  id: 'demographic_survey',
  name: 'Demographic info',
  game: StageGame.BBOT,
  questions: [
    createMultipleChoiceSurveyQuestion({
      questionTitle: 'Are you currently able to become pregnant?',
      options: createMultipleChoiceItems(['Yes', 'No', 'Prefer not to answer']),
    }),

    createMultipleChoiceSurveyQuestion({
      questionTitle:
        'What is the highest level of education you have completed?',
      options: createMultipleChoiceItems([
        'Less than high school',
        'High school diploma or GED',
        'Some college / Associate degree',
        "Bachelor's degree",
        'Graduate or professional degree',
        'Prefer not to answer',
      ]),
    }),

    // Moved to DEMOGRAPHIC_QUESTIONS below
    // createMultipleChoiceSurveyQuestion({
    //   questionTitle:
    //     'Which of the following political parties do your views most align with?',
    //   options: createMultipleChoiceItems([
    //     'Democrat',
    //     'Republican',
    //     'Independent',
    //     'Something else',
    //     'Prefer not to answer',
    //   ]),
    // }),

    // createMultipleChoiceSurveyQuestion({
    //   questionTitle: 'What is your present religion, if any?',
    //   options: createMultipleChoiceItems([
    //     'Christianity (any tradition)',
    //     'Judaism',
    //     'Islam',
    //     'Buddhism',
    //     'Hinduism',
    //     'Atheist / Agnostic / No religion in particular',
    //     'Other religion or spiritual tradition',
    //     'Prefer not to answer',
    //   ]),
    // }),

    createMultipleChoiceSurveyQuestion({
      questionTitle:
        'Would you like to be involved in future studies that involve conversations with people who disagree with you about abortion rights?',
      options: createMultipleChoiceItems(['Yes', 'No']),
    }),
  ],
});

// This is the question we use to match participants who disagree.
const SORTING_HAT_QUESTION = createMultipleChoiceSurveyQuestion({
  id: 'abortion_policy_preference',
  questionTitle: 'Do you think that abortion should be...',
  options: [
    createMultipleChoiceItem({id: 'legal', text: 'Legal in most or all cases'}),
    createMultipleChoiceItem({
      id: 'illegal',
      text: 'Illegal in most or all cases',
    }),
  ],
});

const DEMOGRAPHIC_QUESTIONS: SurveyQuestion[] = [
  createMultipleChoiceSurveyQuestion({
    questionTitle:
      'Which of the following political parties do your views most align with?',
    options: createMultipleChoiceItems([
      'Democrat',
      'Republican',
      'Independent',
      'Something else',
      'Prefer not to answer',
    ]),
  }),

  createMultipleChoiceSurveyQuestion({
    questionTitle: 'What is your present religion, if any?',
    options: createMultipleChoiceItems([
      'Christianity (any tradition)',
      'Judaism',
      'Islam',
      'Buddhism',
      'Hinduism',
      'Atheist / Agnostic / No religion in particular',
      'Other religion or spiritual tradition',
      'Prefer not to answer',
    ]),
  }),
];

const BELIEF_QUESTIONS: SurveyQuestion[] = [
  SORTING_HAT_QUESTION,

  ...DEMOGRAPHIC_QUESTIONS,

  createMultipleChoiceSurveyQuestion({
    questionTitle:
      'Thinking about the area where you live, do you think that obtaining an abortion should be...',
    options: createMultipleChoiceItems([
      'Harder than it is now',
      'About the same difficulty as it is now',
      'Easier than it is now',
    ]),
  }),

  createMultipleChoiceSurveyQuestion({
    questionTitle:
      'How certain are you about your views on the issue of abortion legality?',
    options: createMultipleChoiceItems([
      'Very certain',
      'Somewhat certain',
      'Somewhat uncertain',
      'Very uncertain',
    ]),
  }),

  createMultipleChoiceSurveyQuestion({
    questionTitle:
      'How strongly do you feel about your views on the issue of abortion legality?',
    options: createMultipleChoiceItems([
      'Very strongly',
      'Somewhat strongly',
      'Not very strongly',
      'Not at all strongly',
    ]),
  }),

  createMultipleChoiceSurveyQuestion({
    questionTitle:
      'Thinking about the issue of abortion legality, how likely is it that you might change your views on this issue in the future?',
    options: createMultipleChoiceItems([
      'Very likely',
      'Somewhat likely',
      'Somewhat unlikely',
      'Very unlikely',
    ]),
  }),
];

let BBOT_REPRODUCTIVE_RIGHTS_SURVEY_STAGE_PRE: SurveyStageConfig;

if (SKIP_INITIAL_SURVEY) {
  // If we are skipping the initial survey, ask only the sorting hat question.
  BBOT_REPRODUCTIVE_RIGHTS_SURVEY_STAGE_PRE = createSurveyStage({
    id: 'reproductive_rights_survey_pre',
    name: 'Beliefs about abortion',
    game: StageGame.BBOT,
    questions: [SORTING_HAT_QUESTION, ...DEMOGRAPHIC_QUESTIONS],
  });
} else {
  BBOT_REPRODUCTIVE_RIGHTS_SURVEY_STAGE_PRE = createSurveyStage({
    id: 'reproductive_rights_survey_pre',
    name: 'Beliefs about abortion',
    game: StageGame.BBOT,
    questions: BELIEF_QUESTIONS,
  });
}

const BBOT_REPRODUCTIVE_RIGHTS_SURVEY_STAGE_POST = createSurveyStage({
  id: 'reproductive_rights_survey_post',
  name: 'Beliefs about abortion',
  descriptions: createStageTextConfig({
    primaryText: 'Some of these questions are repeated intentionally',
  }),
  game: StageGame.BBOT,
  questions: BELIEF_QUESTIONS,
});

// we use this twice
const DEMOCRATIC_RECIPROCITY_SURVEY_CONFIG: Partial<SurveyStageConfig> = {
  name: "Beliefs about abortion (cont'd)",
  descriptions: createStageTextConfig({
    primaryText: 'Indicate how much you agree or disagree with each statement.',
  }),
  game: StageGame.BBOT,
  questions: [
    createScaleSurveyQuestion({
      questionTitle:
        'I find it difficult to see things from the point of view of people who disagree with me on abortion rights.',
      ...AGREE_LIKERT_SCALE,
    }),

    createScaleSurveyQuestion({
      questionTitle:
        'It is important to understand people who disagree with me on abortion rights by imagining how things look from their perspective.',
      ...AGREE_LIKERT_SCALE,
    }),

    createScaleSurveyQuestion({
      questionTitle:
        "Even if I don't agree with them, I understand that people have good reasons for voting for candidates who disagree with me on abortion rights.",
      ...AGREE_LIKERT_SCALE,
    }),

    createScaleSurveyQuestion({
      questionTitle:
        'I respect the opinions of people who disagree with me on abortion rights.',
      ...AGREE_LIKERT_SCALE,
    }),
  ],
};
const BBOT_DEMOCRATIC_RECIPROCITY_SURVEY_STAGE_PRE = createSurveyStage({
  id: 'democratic_reciprocity_survey_pre',
  ...DEMOCRATIC_RECIPROCITY_SURVEY_CONFIG,
});
const BBOT_DEMOCRATIC_RECIPROCITY_SURVEY_STAGE_POST = createSurveyStage({
  id: 'democratic_reciprocity_survey_post',
  ...DEMOCRATIC_RECIPROCITY_SURVEY_CONFIG,
});

const FEELING_THERMOMETER_SURVEY_CONFIG: Partial<SurveyStageConfig> = {
  name: 'Feelings about others',
  descriptions: createStageTextConfig({
    primaryText:
      'Imagine a thermometer that ranges from 0 to 10, where 0 means you feel extremely cold, negative, or hostile, and 10 means you feel extremely warm, positive, or friendly.',
  }),
  game: StageGame.BBOT,
  questions: [
    createScaleSurveyQuestion({
      questionTitle:
        'First, think about people who are have the same/similar beliefs as you when it comes to abortion rights. Using this thermometer, what number best describes your overall feelings toward these individuals?',
      upperValue: 10,
      upperText: 'Warm, positive, or friendly',
      lowerValue: 0,
      lowerText: 'Cold, negative, or hostile',
    }),
    createScaleSurveyQuestion({
      questionTitle:
        'Next, think about people who have opposite/different beliefs from you when it comes to abortion rights. Using this thermometer, what number best describes your overall feelings toward these individuals?',
      upperValue: 10,
      upperText: 'Warm, positive, or friendly',
      lowerValue: 0,
      lowerText: 'Cold, negative, or hostile',
    }),
  ],
};

const BBOT_FEELING_THERMOMETER_SURVEY_STAGE_PRE = createSurveyStage({
  id: 'feeling_thermometer_survey_pre',
  ...FEELING_THERMOMETER_SURVEY_CONFIG,
});
const BBOT_FEELING_THERMOMETER_SURVEY_STAGE_POST = createSurveyStage({
  id: 'feeling_thermometer_survey_post',
  ...FEELING_THERMOMETER_SURVEY_CONFIG,
});

const BBOT_CONVERSATION_QUALITY_SURVEY_STAGE = createSurveyStage({
  id: 'conversation_quality_survey',
  name: 'Conversation review',
  descriptions: createStageTextConfig({
    primaryText:
      'Please answer these questions with the conversation you just completed in mind.',
  }),
  game: StageGame.BBOT,
  questions: [
    createScaleSurveyQuestion({
      questionTitle:
        'On a scale from 0-10, please rate the extent to which you and your partner agreed about the issue of abortion rights in the preceding conversation.',
      upperValue: 10,
      upperText: 'High ageeement',
      lowerValue: 0,
      lowerText: 'Low agreement',
    }),

    createScaleSurveyQuestion({
      questionTitle: 'I felt heard and understood by my partner.',
      ...AGREE_LIKERT_SCALE,
    }),

    // createScaleSurveyQuestion({
    //   questionTitle: 'I treated my partner with respect.',
    //   ...AGREE_LIKERT_SCALE,
    // }),

    createScaleSurveyQuestion({
      questionTitle: 'My partner treated me with respect.',
      ...AGREE_LIKERT_SCALE,
    }),

    createScaleSurveyQuestion({
      questionTitle:
        'I was able to communicate my values and beliefs to my partner.',
      ...AGREE_LIKERT_SCALE,
    }),
    createScaleSurveyQuestion({
      questionTitle: "I was able to understand my partner's values and beliefs",
      ...AGREE_LIKERT_SCALE,
    }),

    createMultipleChoiceSurveyQuestion({
      questionTitle: 'Please answer “Somewhat unlikely” to this question.',
      options: createMultipleChoiceItems([
        'Very likely',
        'Somewhat likely',
        'Somewhat unlikely',
        'Very unlikely',
      ]),
    }),

    // createCheckSurveyQuestion({
    //   questionTitle: 'I would talk to this person again.',
    // }),

    // createCheckSurveyQuestion({
    //   questionTitle:
    //     'I would like receive further information about opposing viewpoints.',
    // }),
  ],
});

// commented and not deleted because we may want this for some of our QA runs yet?
// const BBOT_FEEDBACK_SURVEY_STAGE = createSurveyStage({
//   id: 'feedback_survey',
//   name: 'Feedback for researchers',
//   descriptions: createStageTextConfig({
//     primaryText:
//       'This has been a pilot for a larger study. The researchers are interested in your opinions about how to make future versions of it better. Enter "n/a" if you prefer not to answer.',
//   }),
//   game: StageGame.BBOT,
//   questions: [
//     createTextSurveyQuestion({
//       questionTitle:
//         'Tell us in your own words, what are the researchers trying to learn about in this study?',
//     }),
//     createTextSurveyQuestion({
//       questionTitle:
//         "Do you have feedback for the research team on the task or surveys you just completed? Is there anything that was unclear or that didn't work as expected?",
//     }),
//     createTextSurveyQuestion({
//       questionTitle: 'Anything else we should know?',
//     }),
//     createCheckSurveyQuestion({
//       questionTitle:
//         'We would like permission to contact you in the future for a more in-depth paid interview about this study? Check here if you consent to be contacted.',
//     }),
//   ],
// });

const BBOT_TRANSFER_TEXT =
  'Please wait while we match you with another conversation participant, and transfer you to the next phase of the experiment. This usually happens within 5 minutes. The delay has been accounted for in the total study time, so you will be paid for the time you spend waiting.';

const BBOT_TRANSFER_STAGE = createTransferStage({
  id: 'participant_matching_transfer',
  name: 'Wait for other participants',
  game: StageGame.BBOT,
  enableTimeout: false,
  descriptions: createStageTextConfig({primaryText: BBOT_TRANSFER_TEXT}),
  enableSurveyMatching: true,
  surveyStageId: 'reproductive_rights_survey_pre',
  surveyQuestionId: 'abortion_policy_preference',
  participantCounts: {illegal: 1, legal: 1},
  newCohortParticipantConfig: createCohortParticipantConfig({
    maxParticipantsPerCohort: 2,
    includeAllParticipantsInCohortCount: false,
  }),
  conditionProbabilities: {
    control: 0.3334, // No moderator message
    static: 0.3333, // Standard pre-written message
    bot: 0.3333, // AI moderation message
  },
});

const BBOT_CHAT_INTRO_TEXT = `In the next stage, you will have a chat conversation about abortion policy with another participant who may see the issue differently.

The chat is anonymous and will last 10 minutes.

**In your first message, please share a brief statement of your view on abortion policy (1-2 sentences is plenty). What, if anything, should the law allow or restrict, and why?**`;

const BBOT_CHAT_INTRO_STAGE = createInfoStage({
  id: 'chat_intro',
  name: 'Discussion introduction',
  infoLines: BBOT_CHAT_INTRO_TEXT.split('\n'),
});

const CHAT_DESCRIPTION = `You are now in a chat conversation with another participant.

To start the conversation, please share a brief statement of your view on abortion policy (1-2 sentences). What, if anything, should the law allow or restrict, and why?

After sending your first message, please read your partner's messages and continue the discussion.`;

const STATIC_CHAT_MESSAGE = `Hi {{participants}}, Bridging Bot here. I appreciate you both sharing your views on such a complex and personal topic.

I wonder if you would each be open to sharing more about the experiences and values that have shaped your beliefs on this issue. Hearing more about this could lead to deeper understanding of where each of you is coming from.`;

const BBOT_CHAT_STAGE = createChatStage({
  game: StageGame.BBOT,
  id: BBOT_CHAT_STAGE_ID,
  name: 'Group discussion',
  timeLimitInMinutes: 10,
  requireFullTime: true,
  descriptions: {
    primaryText: CHAT_DESCRIPTION,
    infoText: '',
    helpText: '',
  },
  progress: createStageProgressConfig({
    minParticipants: 2,
    waitForAllParticipants: true,
    showParticipantProgress: false,
  }),
});

const createBbotAgent = () => {
  const persona = createAgentPersonaConfig({
    name: 'BridgingBot',
    isDefaultAddToCohort: true,
    defaultProfile: createParticipantProfileBase({
      name: 'BridgingBot',
      avatar: '💁',
    }),
    defaultModelSettings: createAgentModelSettings({
      apiType: ApiKeyType.OPENAI_API_KEY,
      modelName: 'gpt-4.1-2025-04-14',
    }),
  });

  const chatPromptMap: Record<string, AgentChatPromptConfig> = {};
  chatPromptMap[BBOT_CHAT_STAGE_ID] = createAgentChatPromptConfig(
    BBOT_CHAT_STAGE_ID, // stage ID
    StageKind.CHAT, // stage kind,
    AgentPersonaType.MEDIATOR,
    {
      promptContext: BBOT_AGENT_PROMPT,
      generationConfig: createModelGenerationConfig({
        temperature: 1.3,
      }),
      shouldRespondPromptContext: BBOT_SHOULD_RESPOND_PROMPT,
      shouldRespondGenerationConfig: createModelGenerationConfig({
        temperature: 0.4,
      }),
      promptSettings: createAgentPromptSettings({
        includeStageHistory: false,
        includeStageInfo: false, // Do not include the chat description, since it could be confusing
      }),
      chatSettings: createAgentChatSettings({
        wordsPerMinute: 300,
        minMessagesBeforeResponding: 5,
        canSelfTriggerCalls: false,
        maxResponses: 1,
      }),
      experimentalConditionConfig: createExperimentalConditionConfig({
        control: {
          responseType: AgentChatResponseType.HIDE,
        },
        static: {
          responseType: AgentChatResponseType.STATIC,
          staticMessage: STATIC_CHAT_MESSAGE,
        },
        bot: {
          responseType: AgentChatResponseType.LLM,
        },
      }),
    },
  );

  return {persona, participantPromptMap: {}, chatPromptMap};
};

export const BBOT_AGENTS = [createBbotAgent()];
