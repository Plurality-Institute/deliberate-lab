import {
  AgentChatPromptConfig,
  ApiKeyType,
  createAgentChatPromptConfig,
  createAgentPromptSettings,
  createAgentChatSettings,
  createAgentModelSettings,
  createAgentPersonaConfig,
  createChatStage,
  createCheckSurveyQuestion,
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
  createTextSurveyQuestion,
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
} from '@deliberation-lab/utils';

export const BBOT_METADATA = createMetadataConfig({
  name: 'Bridging Bot Lab: Reproductive Rights Chat',
  publicName: 'Reproductive Rights Chat',
  description: 'A discussion about reprodictive rights',
});

export const BBOT_CHAT_STAGE_ID = 'bbot_chat';

export function getBbotStageConfigs(): StageConfig[] {
  const stages: StageConfig[] = [];

  // Informed consent
  stages.push(BBOT_TOS_STAGE);

  // Anonymized profiles
  stages.push(BBOT_PROFILE_STAGE);

  // Pre-intervention surveys
  stages.push(BBOT_REPRODUCTIVE_RIGHTS_SURVEY_STAGE_PRE);
  stages.push(BBOT_DEMOCRATIC_RECIPROCITY_SURVEY_STAGE_PRE);

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
  stages.push(BBOT_DEMOGRAPHIC_SURVEY_STAGE);
  stages.push(BBOT_FEEDBACK_SURVEY_STAGE);
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

const BBOT_AGENT_PROMPT = `You are Bridging Bot, an AI-powered tool that can automatically intervene in polarized online conversations. Your goal is to act as a thoughtful conflict mediator and to promote *productive* disagreement, helping users to find common ground and build mutual understanding, without trying to eliminate disagreement.

You are currently in a conversation with two participants who are discussing abortion rights. You are being asked to decide whether and how you would like to send a message response in the chat conversation.

Your first task is to identify whether to respond. You should send a response if the conversation is currently characterized by the presence of *unproductive* conflict. If the conversation has become unproductive, you should respond. If not, you should not respond.

Unproductive conflict is characterized by the presence of perceived disagreement, emotional tension, or opposing perspectives. The conflict is unproductive if:

- It arises from a misunderstanding in the use of terms, concepts, or language by conversational participants. The misunderstanding must be substantive. Potential misunderstandings, small errors in typing and grammar, or poorly-worded phrases are not themselves indicative of unproductive conflict.
- It involves personal attacks, name-calling, or other forms of heightened hostility.
- It is likely to lead to the reinforcement of divisions and/or a breakdown in relationship between conversational participants

Regardless of the above, a conversation is NOT unproductive if it has all three of these features:

- Mutual respect between conversational participants
- A willingness by participants to listen to, learn from, and acknowledge opposing viewpoints
- The conversation is likely to lead to increased trust, cooperation and mutual understanding between participants.

A mere disagreement does not warrant a response. Many disagreements resolve productively. Do not respond unless you see clear evidence of escalation from both participants.

If you do not respond now, you will have another chance to respond as the conversation continues. However, if you do respond now, you will not be able to respond again, so think carefully about whether this is the best time to respond, given your overall goals.

If you DO choose to respond, your second task is to decide what response message to send to the conversation participants.

The goal of your message is to help the conversation become more productive going forward; it is NOT to express your belief about whether the conversation is or is not productive currently.

Your response should be thoughtful and empathetic. Some strategies you could employ are:

- Restatement: include a de-escalated and mutually comprehensible summary of each participant's beliefs and why they seem to be disagreeing.
- Clarification: clarify any potential misunderstandings or conflicts in the use of language or phrases between the participants.
- Consensus prediction: propose a consensus position related to the discussion that you think both participants might agree with.

For each of these elements, you should make a decision about whether to include it in your response message based on the following principles:

- Restatement is most useful in cases where participant beliefs or the reasons for their disagreement are unclear or obscured by escalated language.
- Clarification is most useful if there seems to be some misunderstanding in the use of language or phrases between the participants.
- Consensus prediction is most useful when there is a likely point of agreement between the two users which has not yet been surfaced in the conversation. Do not include consensus prediction if the only potential point of agreement is overly vague or generic.

You must do all of the following:

- Directly address the participants involved in the conversation by name.
- Include an identification of yourself as “Bridging Bot”.
- Have a friendly non-technical tone but still be clear and take from the style of messages themselves (we want to fit into the tone of the chat while still being clear and positive)
- Make your response less than 200 words total. Tailor the length of your response to be similar to the length of the previous messages in the conversation.
- Everyone knows this is a conversation about abortion, so don't waste time re-stating that.
- Be declarative, do not ask questions of the users, since you will not be able to respond to their answers.
- Reference specific pieces of the conversation in your summary rather than generalities.
- Do not infer too much about participants' unstated beliefs. Be understanding, but don't put words in people's mouths.
- Do not use bulleted lists or other markdown formatting. Just write the response as a single paragraph.
- Do not use the collective "we".
- Do not be condescending or judgmental.
- Do not be prescriptive in proposing a way forward.
`;

const BBOT_CONSENT = `**You must read and agree to these terms to participate in the study.**

**Researchers:** Jeffrey Fossett: Harvard University, Ian Baker: UC Berkeley
**Sponsors/Supporters:** Plurality Institute, Jigsaw

We are a team of researchers investigating ways to improve the quality of online discussions. You are being invited to participate in a technical pilot to improve the design of a research project that will be conducted in the future. Results from this pilot will not be published.

If you agree to participate, you will be asked to have a text-based conversation about abortion and reproductive rights with another research participant who disagrees with you on this issue. An AI bot will also be present in the chat, and may interject in the conversation from time to time. Researchers will be able to see the content of your messages, but they will never be shared outside of the research team.

If you proceed, you will be asked to complete a survey, followed by a chat conversation, and then an additional survey. You will be paid at the rate specified on Prolific when you have completed the second survey.

This study will take approximately 30 minutes to complete. With your permission, we may contact you for a further paid followup study opportunity. Participation in that study is optional, and your payment for this study is not contingent on your agreement to participate in future research.

A single individual may not participate in this study more than once. You will be ineligible for payment if we detect that you attempted to participate a second time.

**Risks and Benefits**

A risk of taking part in this study is the possibility of a loss of confidentiality or privacy. Loss of privacy means having your personal information shared with someone who is not on the study team and was not supposed to see or know about your information. The study team plans to protect your privacy. Their plans for keeping your information private are described in the Confidentiality section.

You may or may not receive personal (direct) benefit from taking part in this study. The possible benefits of taking part in this study include an opportunity to debate or learn new information about an issue that may be important to you.

**Privacy and Confidentiality**

Your privacy and confidentiality of your responses are of paramount importance both to us and to our universities. We do not collect information about your identity, and we cannot re-contact you except through the Prolific platform. Your conversation transcripts and survey answers will never be shared outside the research team. Please contact us if you have any doubts or concerns.

The researchers listed above will be able to look at, copy, use, and share your research information.

**Participant's Rights**

Participation is voluntary. Refusal to participate or withdrawing from the research will involve no penalty or loss of benefits to which you might otherwise be entitled.

**Contact Details**

If you have any questions, doubts, or would like us to remove your data from our database, please contact Jeffrey Fossett at jeff@plurality.institute.

By selecting “I accept the terms of service” below, you certify that you are at least 18 years old and a resident of the United States, and that you agree to participate in this research study.`;

const BBOT_TOS_STAGE = createTOSStage({
  id: 'tos',
  game: StageGame.CHP,
  name: 'Consent',
  tosLines: BBOT_CONSENT.split('\n'),
});

const BBOT_DEBRIEF_TEXT = `**Debriefing Statement**

Thank you for participating in this study. We want to let you know that some elements of the study involved intentional deception. Specifically, you were told that your chat transcript would be shown to future participants who would evaluate your conversation. In reality, this step will not take place. This was included solely to help create the feeling of a public or evaluative context, which we believe better simulates how people behave in online conversations. The true purpose of the study is to explore how large language models can help mediate disagreements between people. Your participation helps us develop new approaches for fostering more constructive dialogue in online spaces. If you have any concerns, please don't hesitate to contact us. You can message us on Prolific or email Jeffrey Fossett at jeff@plurality.institute.`;

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
    createTextSurveyQuestion({
      questionTitle:
        'In which US state do you currently reside? (Please enter the two-letter state code, eg. NY or FL)',
    }),

    createMultipleChoiceSurveyQuestion({
      questionTitle:
        'Which of the following best describes your religious preference?',
      options: createMultipleChoiceItems([
        'Buddhist',
        'Christian (Protestant)',
        'Christian (Catholic)',
        'Hindu',
        'Jewish',
        'Muslim',
        'Spiritual but not religious',
        'Atheist or Agnostic',
        'Another religious or belief system',
        'Prefer not to answer',
      ]),
    }),

    // Questions can't be optional, so we're going to skip the write-in answers for now.
    // createTextSurveyQuestion({
    //   questionTitle:
    //     'If you indicated "Another religious or belief system" above, please specify.',
    // }),

    createMultipleChoiceSurveyQuestion({
      questionTitle:
        'Which of the following best describes your political affiliation?',
      options: createMultipleChoiceItems([
        'Democrat',
        'Republican',
        'Independent',
        'Libertarian',
        'Green Party',
        'Other',
        'I do not identify with a political party',
        'Prefer not to answer',
      ]),
    }),

    // createTextSurveyQuestion({
    //   questionTitle: 'If you indicated "Other" above, please specify.',
    // }),

    createMultipleChoiceSurveyQuestion({
      questionTitle:
        'Which category best describes your total annual household income before taxes?',
      options: createMultipleChoiceItems([
        'Less than $25,000',
        '$25,000 - $49,999',
        '$50,000 - $74,999',
        '$75,000 - $99,999',
        '$100,000 - $149,999',
        '$150,000 - $199,999',
        '$200,000 or more',
        'Prefer not to answer',
      ]),
    }),

    createMultipleChoiceSurveyQuestion({
      questionTitle: 'What is your age?',
      options: createMultipleChoiceItems([
        'Under 18',
        '18-24',
        '25-34',
        '35-44',
        '45-54',
        '55-64',
        '65 or older',
        'Prefer not to answer',
      ]),
    }),

    createMultipleChoiceSurveyQuestion({
      questionTitle:
        'Which of the following best describes your gender identity?',
      options: createMultipleChoiceItems([
        'Female',
        'Male',
        'Non-binary',
        'Genderqueer/genderfluid',
        'Another gender identity',
        'Prefer not to answer',
      ]),
    }),

    // createTextSurveyQuestion({
    //   questionTitle:
    //     'If you indicated "Another gender identity" above, please specify.',
    // }),
  ],
});

const pastActionQuestions: SurveyQuestion[] = [
  createCheckSurveyQuestion({
    questionTitle:
      'I have donated to an abortion rights or anti-abortion organization',
  }),
  createCheckSurveyQuestion({
    questionTitle:
      'I have attended a protest or rally related to abortion policy',
  }),
  createCheckSurveyQuestion({
    questionTitle: 'I have contacted an elected official about abortion policy',
  }),
  createCheckSurveyQuestion({
    questionTitle:
      'I have discussed abortion rights extensively with friends or family',
  }),
  createCheckSurveyQuestion({
    questionTitle:
      'I have made a decision about whether to vote for a political candidate due to their beliefs on abortion',
  }),
];

const beliefQuestions: SurveyQuestion[] = [
  createMultipleChoiceSurveyQuestion({
    questionTitle: 'Do you consider yourself to be...',
    options: createMultipleChoiceItems([
      'Pro-life',
      'Pro-choice',
      'Neither or unsure',
    ]),
  }),

  createMultipleChoiceSurveyQuestion({
    questionTitle: 'Do you think that abortion should be...',
    options: createMultipleChoiceItems([
      'Legal in all cases',
      'Legal in most cases',
      'Illegal in most cases',
      'Illegal in all cases',
    ]),
  }),

  createMultipleChoiceSurveyQuestion({
    questionTitle:
      'Thinking about the area where you live, how easy or difficult do you think it would be for someone to obtain an abortion near you?',
    options: createMultipleChoiceItems([
      'Very difficult',
      'Somewhat difficult',
      'Somewhat easy',
      'Very easy',
    ]),
  }),

  createMultipleChoiceSurveyQuestion({
    questionTitle:
      'Still thinking about the area where you live, do you think that obtaining an abortion should be...',
    options: createMultipleChoiceItems([
      'Harder than it is now ',
      'Easier than it is now ',
      'About the same difficulty as it is now',
    ]),
  }),

  createMultipleChoiceSurveyQuestion({
    questionTitle:
      'Regardless of whether you think abortion should be legal or illegal, how well does this statement describe your views? "The decision about whether to have an abortion should belong solely to the pregnant woman."',
    options: createMultipleChoiceItems([
      'Extremely well',
      'Very well',
      'Somewhat well',
      'Not too well',
      'Not at all well',
    ]),
  }),

  createMultipleChoiceSurveyQuestion({
    questionTitle:
      'Regardless of whether you think abortion should be legal or illegal, how well does this statement describe your views? "Human life begins at conception, so a fetus is a person with rights."',
    options: createMultipleChoiceItems([
      'Extremely well',
      'Very well',
      'Somewhat well',
      'Not too well',
      'Not at all well',
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

const BBOT_REPRODUCTIVE_RIGHTS_SURVEY_STAGE_PRE = createSurveyStage({
  id: 'reproductive_rights_survey_pre',
  name: 'Beliefs about abortion',
  game: StageGame.BBOT,
  questions: [...beliefQuestions, ...pastActionQuestions],
});

const BBOT_REPRODUCTIVE_RIGHTS_SURVEY_STAGE_POST = createSurveyStage({
  id: 'reproductive_rights_survey_post',
  name: 'Beliefs about abortion',
  descriptions: createStageTextConfig({
    primaryText: 'These questions are repeated intentionally',
  }),
  game: StageGame.BBOT,
  questions: beliefQuestions,
});

// we use this twice
const democraticResiprocitySurveyConfig: Partial<SurveyStageConfig> = {
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
  ...democraticResiprocitySurveyConfig,
});
const BBOT_DEMOCRATIC_RECIPROCITY_SURVEY_STAGE_POST = createSurveyStage({
  id: 'democratic_reciprocity_survey_post',
  descriptions: createStageTextConfig({
    primaryText: 'These questions are repeated intentionally',
  }),
  ...democraticResiprocitySurveyConfig,
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
      questionTitle: 'How would you grade the quality of the conversation?',
      upperValue: 10,
      upperText: 'High quality',
      lowerValue: 1,
      lowerText: 'Low quality',
    }),

    createScaleSurveyQuestion({
      questionTitle: 'I felt heard and understood by my partner.',
      ...AGREE_LIKERT_SCALE,
    }),

    createScaleSurveyQuestion({
      questionTitle: 'I treated my partner with respect.',
      ...AGREE_LIKERT_SCALE,
    }),

    createScaleSurveyQuestion({
      questionTitle: 'My partner treated me with respect.',
      ...AGREE_LIKERT_SCALE,
    }),

    createScaleSurveyQuestion({
      questionTitle:
        'I was able to communicate my values and beliefs to my partner.',
      ...AGREE_LIKERT_SCALE,
    }),

    createCheckSurveyQuestion({
      questionTitle: 'I would talk to this person again.',
    }),

    createCheckSurveyQuestion({
      questionTitle:
        'I would like receive further information about opposing viewpoints.',
    }),
  ],
});

const BBOT_FEEDBACK_SURVEY_STAGE = createSurveyStage({
  id: 'feedback_survey',
  name: 'Feedback for researchers',
  descriptions: createStageTextConfig({
    primaryText:
      'This has been a pilot for a larger study. The researchers are interested in your opinions about how to make future versions of it better. Enter "n/a" if you prefer not to answer.',
  }),
  game: StageGame.BBOT,
  questions: [
    createTextSurveyQuestion({
      questionTitle:
        'Tell us in your own words, what are the researchers trying to learn about in this study?',
    }),
    createTextSurveyQuestion({
      questionTitle:
        "Do you have feedback for the research team on the task or surveys you just completed? Is there anything that was unclear or that didn't work as expected?",
    }),
    createTextSurveyQuestion({
      questionTitle: 'Anything else we should know?',
    }),
    createCheckSurveyQuestion({
      questionTitle:
        'We would like permission to contact you in the future for a more in-depth paid interview about this study? Check here if you consent to be contacted.',
    }),
  ],
});

const BBOT_TRANSFER_TEXT =
  'Please wait while we match you with another conversation participant, and transfer you to the next phase of the experiment. This usually happens within 5 minutes. The delay has been accounted for in the total study time, so you will be paid for the time you spend waiting.';

const BBOT_TRANSFER_STAGE = createTransferStage({
  id: 'participant_matching_transfer',
  name: 'Wait for other participants',
  game: StageGame.BBOT,
  enableTimeout: false,
  descriptions: createStageTextConfig({primaryText: BBOT_TRANSFER_TEXT}),
});

const BBOT_CHAT_INTRO_TEXT = `On the next screen, you will have a conversation with another participant. To get started, explain your position on abortion policy. What should the law be, and why?

Your anonymous chat transcript will be shown to other participants in a later phase of the experiment, where they will be asked to share their opinions about what you have said.
`;

const BBOT_CHAT_INTRO_STAGE = createInfoStage({
  id: 'chat_intro',
  name: 'Discussion introduction',
  infoLines: BBOT_CHAT_INTRO_TEXT.split('\n'),
});

const BBOT_CHAT_STAGE = createChatStage({
  game: StageGame.BBOT,
  id: BBOT_CHAT_STAGE_ID,
  name: 'Group discussion',
  timeLimitInMinutes: 10,
  descriptions: {
    primaryText:
      'In this discussion, you will have a conversation with one other participant. To get started, explain your position on abortion policy. What should the law be, and why? Your conversation will be shown to other participants in a later phase of the experiment, where they will be asked to share their opinions about what you have said. A facilitator bot may sometimes chime in as well.',
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
      modelName: 'gpt-4o',
    }),
  });

  const chatPromptMap: Record<string, AgentChatPromptConfig> = {};
  chatPromptMap[BBOT_CHAT_STAGE_ID] = createAgentChatPromptConfig(
    BBOT_CHAT_STAGE_ID, // stage ID
    StageKind.CHAT, // stage kind,
    {
      promptContext: BBOT_AGENT_PROMPT,
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
    },
  );

  return {persona, participantPromptMap: {}, chatPromptMap};
};

export const BBOT_AGENTS = [createBbotAgent()];
