import type { FallacyType } from './types';

export interface FallacyDefinition {
  type: FallacyType;
  name: string;
  shortDescription: string;
  softLanguageTemplate: string;
  color: string; // underline color for inline annotations
}

export const FALLACY_DEFINITIONS: Record<FallacyType, FallacyDefinition> = {
  straw_man: {
    type: 'straw_man',
    name: 'Straw Man',
    shortDescription: "Misrepresenting someone's argument to make it easier to attack",
    softLanguageTemplate:
      'This passage appears to simplify or misrepresent an opposing position. Consider checking the original source to see the full argument.',
    color: '#e74c3c',
  },
  begging_the_question: {
    type: 'begging_the_question',
    name: 'Begging the Question',
    shortDescription: 'Assuming the conclusion within the premise',
    softLanguageTemplate:
      "The reasoning here may assume the very thing it's trying to prove. Look for independent evidence that supports this claim.",
    color: '#e67e22',
  },
  ad_hominem: {
    type: 'ad_hominem',
    name: 'Ad Hominem',
    shortDescription: 'Attacking the person rather than the argument',
    softLanguageTemplate:
      'This passage focuses on the person rather than their argument. Consider whether the underlying claim has merit regardless of who said it.',
    color: '#9b59b6',
  },
  post_hoc: {
    type: 'post_hoc',
    name: 'Post Hoc (False Cause)',
    shortDescription: 'Assuming causation from correlation or sequence',
    softLanguageTemplate:
      'This suggests one event caused another, but the connection may not be established. Consider whether other factors could explain this.',
    color: '#3498db',
  },
  false_dichotomy: {
    type: 'false_dichotomy',
    name: 'False Dichotomy',
    shortDescription: 'Presenting only two options when more exist',
    softLanguageTemplate:
      'This presents a limited set of choices. Consider whether there are other options or middle-ground positions not mentioned.',
    color: '#f39c12',
  },
  equivocation: {
    type: 'equivocation',
    name: 'Equivocation',
    shortDescription: 'Using a word with multiple meanings ambiguously',
    softLanguageTemplate:
      'A key term here may be used in more than one sense, which could make the argument seem stronger than it is. Consider how the term is defined.',
    color: '#2ecc71',
  },
  appeal_to_authority: {
    type: 'appeal_to_authority',
    name: 'Appeal to Authority',
    shortDescription: "Using an authority figure's opinion as proof",
    softLanguageTemplate:
      "This relies on someone's authority or credentials rather than evidence. Consider whether the cited authority is relevant to this specific topic.",
    color: '#34495e',
  },
  hasty_generalization: {
    type: 'hasty_generalization',
    name: 'Hasty Generalization',
    shortDescription: 'Drawing broad conclusions from limited examples',
    softLanguageTemplate:
      'This draws a broad conclusion from a limited number of examples. Consider whether the evidence is representative of the larger picture.',
    color: '#e91e63',
  },
  appeal_to_popular_opinion: {
    type: 'appeal_to_popular_opinion',
    name: 'Appeal to Popular Opinion',
    shortDescription: 'Arguing something is true because many believe it',
    softLanguageTemplate:
      "This suggests something is true because it's widely believed. Popular opinion doesn't always align with evidence — consider looking at the underlying data.",
    color: '#00bcd4',
  },
  red_herring: {
    type: 'red_herring',
    name: 'Red Herring',
    shortDescription: 'Introducing an irrelevant topic to divert attention',
    softLanguageTemplate:
      'This may introduce a topic that diverts from the main issue. Consider whether this point is directly relevant to the original discussion.',
    color: '#795548',
  },
  appeal_to_emotion: {
    type: 'appeal_to_emotion',
    name: 'Appeal to Emotion',
    shortDescription: 'Using emotional manipulation instead of logical argument',
    softLanguageTemplate:
      'This passage may rely on emotional appeal rather than evidence. Consider whether the underlying claim stands on its own merits.',
    color: '#ff5722',
  },
  whataboutism: {
    type: 'whataboutism',
    name: 'Whataboutism',
    shortDescription: "Deflecting criticism by pointing to someone else's behavior",
    softLanguageTemplate:
      "This may deflect from the issue by pointing to another party's actions. Consider whether the original concern is still valid regardless.",
    color: '#607d8b',
  },
  loaded_language: {
    type: 'loaded_language',
    name: 'Loaded Language',
    shortDescription: 'Using emotionally charged words to influence perception',
    softLanguageTemplate:
      'The language here may be chosen to evoke a strong emotional response. Consider how more neutral phrasing might change your perception.',
    color: '#ff9800',
  },
  slippery_slope: {
    type: 'slippery_slope',
    name: 'Slippery Slope',
    shortDescription: 'Arguing one event will inevitably lead to extreme consequences',
    softLanguageTemplate:
      'This suggests a chain of consequences that may not be inevitable. Consider whether each step in the chain is actually likely.',
    color: '#8bc34a',
  },
  loaded_question: {
    type: 'loaded_question',
    name: 'Loaded Question',
    shortDescription: 'A question that presupposes something unproven',
    softLanguageTemplate:
      "This question may contain an assumption that hasn't been established. Consider whether you agree with the premise before engaging with the question.",
    color: '#cddc39',
  },
  false_equivalence: {
    type: 'false_equivalence',
    name: 'False Equivalence',
    shortDescription: 'Treating two very different things as if they are the same',
    softLanguageTemplate:
      'This may equate two situations that differ in important ways. Consider whether the comparison is fair given the differences.',
    color: '#009688',
  },
  circular_reasoning: {
    type: 'circular_reasoning',
    name: 'Circular Reasoning',
    shortDescription: 'Using the conclusion as a premise in the argument',
    softLanguageTemplate:
      'The reasoning here may be circular — the conclusion may be restated as evidence. Look for independent support for this claim.',
    color: '#673ab7',
  },
  false_analogy: {
    type: 'false_analogy',
    name: 'False Analogy',
    shortDescription: 'Comparing two things that differ in crucial ways',
    softLanguageTemplate:
      'This comparison may not hold up under closer examination. Consider whether the things being compared are truly similar in the ways that matter.',
    color: '#1abc9c',
  },
  appeal_to_ignorance: {
    type: 'appeal_to_ignorance',
    name: 'Appeal to Ignorance',
    shortDescription: 'Arguing something is true because it hasn\'t been proven false',
    softLanguageTemplate:
      'The absence of proof against a claim does not prove it is true. Consider whether positive evidence has been provided to support this assertion.',
    color: '#2980b9',
  },
  appeal_to_nature: {
    type: 'appeal_to_nature',
    name: 'Appeal to Nature',
    shortDescription: 'Arguing something is good because it is "natural"',
    softLanguageTemplate:
      'Something being natural does not automatically make it beneficial or desirable. Consider evaluating this on its own merits rather than its naturalness.',
    color: '#27ae60',
  },
  appeal_to_tradition: {
    type: 'appeal_to_tradition',
    name: 'Appeal to Tradition',
    shortDescription: 'Arguing something is right because it has always been done that way',
    softLanguageTemplate:
      'Long-standing practice does not necessarily mean something is correct or optimal. Consider whether circumstances have changed since this tradition was established.',
    color: '#8e44ad',
  },
  no_true_scotsman: {
    type: 'no_true_scotsman',
    name: 'No True Scotsman',
    shortDescription: 'Redefining criteria to dismiss counterexamples',
    softLanguageTemplate:
      'The criteria here may be shifting to exclude inconvenient counterexamples. Consider whether the definition is being changed after the fact to protect a generalization.',
    color: '#c0392b',
  },
  guilt_by_association: {
    type: 'guilt_by_association',
    name: 'Guilt by Association',
    shortDescription: 'Discrediting by linking to a negative association',
    softLanguageTemplate:
      'This may attempt to discredit through association rather than addressing arguments directly. Consider whether the linkage is relevant to the actual claim being made.',
    color: '#d35400',
  },
  cherry_picking: {
    type: 'cherry_picking',
    name: 'Cherry Picking',
    shortDescription: 'Selectively presenting only supporting evidence',
    softLanguageTemplate:
      'This may present only one side of the evidence. Consider looking for contradictory data or perspectives that may have been omitted.',
    color: '#16a085',
  },
  genetic_fallacy: {
    type: 'genetic_fallacy',
    name: 'Genetic Fallacy',
    shortDescription: 'Judging something based on its origin rather than merit',
    softLanguageTemplate:
      'The origin of an idea does not determine its validity. Consider evaluating this claim on its own merits rather than who proposed it or where it came from.',
    color: '#7f8c8d',
  },
  composition_division: {
    type: 'composition_division',
    name: 'Composition / Division',
    shortDescription: 'Assuming parts and wholes share the same properties',
    softLanguageTemplate:
      'What is true of a part may not be true of the whole, and vice versa. Consider whether this generalization from part to whole (or whole to part) is justified.',
    color: '#2c3e50',
  },
  anecdotal_evidence: {
    type: 'anecdotal_evidence',
    name: 'Anecdotal Evidence',
    shortDescription: 'Using personal stories as definitive proof',
    softLanguageTemplate:
      'This relies on a personal story or isolated example rather than systematic evidence. Consider whether broader data might tell a different story.',
    color: '#f1c40f',
  },
  appeal_to_consequence: {
    type: 'appeal_to_consequence',
    name: 'Appeal to Consequence',
    shortDescription: 'Arguing a belief is true/false based on its consequences',
    softLanguageTemplate:
      'Whether consequences are desirable or undesirable does not determine whether something is actually true. Consider the evidence independently of the implications.',
    color: '#1e88e5',
  },
  shifting_burden_of_proof: {
    type: 'shifting_burden_of_proof',
    name: 'Shifting Burden of Proof',
    shortDescription: 'Demanding others disprove a claim rather than proving it',
    softLanguageTemplate:
      'The responsibility to prove a claim typically lies with the person making it. Consider whether evidence has been provided, or if you are being asked to disprove an unsupported assertion.',
    color: '#6d4c41',
  },
  glittering_generalities: {
    type: 'glittering_generalities',
    name: 'Glittering Generalities',
    shortDescription: 'Using vague, emotionally positive words without substance',
    softLanguageTemplate:
      'This uses broad, positive-sounding language that may lack specific, verifiable meaning. Consider asking what concrete actions or evidence support these appealing-sounding words.',
    color: '#ab47bc',
  },
  plain_folks: {
    type: 'plain_folks',
    name: 'Plain Folks',
    shortDescription: 'Portraying oneself as an ordinary person to build trust',
    softLanguageTemplate:
      'This may attempt to build trust through manufactured relatability rather than evidence. Consider whether the "common person" appeal is a substitute for substantive argument.',
    color: '#26a69a',
  },
  transfer: {
    type: 'transfer',
    name: 'Transfer',
    shortDescription: 'Borrowing prestige by associating with respected symbols',
    softLanguageTemplate:
      'This may use respected symbols or institutions to lend credibility. Consider whether the association is genuinely relevant or is being used to borrow unearned authority.',
    color: '#5c6bc0',
  },
  testimonial: {
    type: 'testimonial',
    name: 'Testimonial',
    shortDescription: 'Using celebrity or public figure endorsements as proof',
    softLanguageTemplate:
      'This uses a well-known figure\'s endorsement to build credibility. Consider whether the endorser has relevant expertise on this specific topic.',
    color: '#ef5350',
  },
  name_calling: {
    type: 'name_calling',
    name: 'Name Calling / Labeling',
    shortDescription: 'Using derogatory labels to create prejudice',
    softLanguageTemplate:
      'This may use negative labels to create prejudice rather than engaging with the actual argument. Consider whether the characterization is fair and evidence-based.',
    color: '#d32f2f',
  },
  scapegoating: {
    type: 'scapegoating',
    name: 'Scapegoating',
    shortDescription: 'Blaming a group for complex problems they didn\'t cause',
    softLanguageTemplate:
      'This may oversimplify blame for a complex problem by directing it at a specific group. Consider whether the actual causes may be more systemic or multifaceted.',
    color: '#c62828',
  },
  fear_mongering: {
    type: 'fear_mongering',
    name: 'Fear Mongering',
    shortDescription: 'Exaggerating threats to create panic and suppress analysis',
    softLanguageTemplate:
      'This may exaggerate a threat to create urgency or fear. Consider whether the danger described is supported by evidence and proportionate to the response being advocated.',
    color: '#b71c1c',
  },
  dog_whistle: {
    type: 'dog_whistle',
    name: 'Dog Whistle',
    shortDescription: 'Using coded language with hidden meaning for a subgroup',
    softLanguageTemplate:
      'This language may carry coded meaning beyond its surface interpretation. Consider whether certain phrases might signal something specific to a targeted audience.',
    color: '#4a148c',
  },
  innuendo: {
    type: 'innuendo',
    name: 'Innuendo',
    shortDescription: 'Implying something negative without stating it directly',
    softLanguageTemplate:
      'This may imply something negative without stating it directly. Consider whether the suggestion is supported by evidence or is relying on implication alone.',
    color: '#880e4f',
  },
  projection: {
    type: 'projection',
    name: 'Projection',
    shortDescription: 'Accusing others of one\'s own behavior or tactics',
    softLanguageTemplate:
      'This accusation may mirror the accuser\'s own conduct. Consider whether the criticism being leveled could also apply to the person making it.',
    color: '#004d40',
  },
  sloganeering: {
    type: 'sloganeering',
    name: 'Sloganeering',
    shortDescription: 'Using catchy phrases instead of substantive argument',
    softLanguageTemplate:
      'This relies on a catchy phrase rather than substantive reasoning. Consider whether a memorable slogan is being used as a substitute for actual evidence.',
    color: '#e65100',
  },
  euphemism_dysphemism: {
    type: 'euphemism_dysphemism',
    name: 'Euphemism / Dysphemism',
    shortDescription: 'Replacing accurate language to soften or inflame perception',
    softLanguageTemplate:
      'The language here may be chosen to make something sound better or worse than it actually is. Consider what more neutral or precise terminology might look like.',
    color: '#1a237e',
  },
  other: {
    type: 'other',
    name: 'Other Technique',
    shortDescription: 'A rhetorical technique identified by the LLM',
    softLanguageTemplate:
      'This passage may use a rhetorical technique worth examining. Consider the explanation below for more context.',
    color: '#9e9e9e',
  },
};

/** All fallacy types for iteration */
export const FALLACY_TYPES = Object.keys(FALLACY_DEFINITIONS) as FallacyType[];

/** Default confidence threshold below which detections are hidden */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.4;

/** Extension name */
export const EXTENSION_NAME = 'ClearRead';
