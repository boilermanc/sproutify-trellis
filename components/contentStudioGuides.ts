import { Award, BrainCircuit, CalendarClock, Clapperboard, Film, LayoutTemplate, MessageCircle, Music, Share2, Sparkles, TrendingUp, Video, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ViewState } from '../types';

interface StudioGuide {
  icon: LucideIcon;
  description: string;
  example: string;
  steps: [string, string, string];
}

export const CONTENT_STUDIO_GUIDES: Partial<Record<ViewState, StudioGuide>> = {
  'social-hub': {
    icon: Share2,
    description: 'Write and organize everyday social posts for your brand. Get help with captions, plan your content calendar, and prepare posts for your social channels.',
    example: 'Plan a week of gardening tips with captions for Instagram and Facebook.',
    steps: ['Choose a channel', 'Draft your posts', 'Review and export'],
  },
  'content-intelligence': {
    icon: BrainCircuit,
    description: 'Decide what to talk about next and remember what works. Research audience questions, connect published content to results, and save lessons for this branch.',
    example: 'Find a useful content idea, test it, and record what the results taught you.',
    steps: ['Research an idea', 'Track the results', 'Save the lesson'],
  },
  'reddit-growth': {
    icon: MessageCircle,
    description: 'Plan and manage paid Reddit campaigns. Work on the audience, target communities, ad copy, and creative, then review campaign performance.',
    example: 'Build a Reddit ad campaign for people interested in indoor gardening.',
    steps: ['Plan the campaign', 'Review the ads', 'Check performance'],
  },
  'video-ad-lab': {
    icon: Sparkles,
    description: 'Turn an advertising idea into creative you can review. Make static image ads, carousels, or video concepts with AI-assisted visuals and copy.',
    example: 'Create a carousel ad introducing three reasons to try your product.',
    steps: ['Pick an ad format', 'Describe your idea', 'Review the creative'],
  },
  'media-generation': {
    icon: Video,
    description: 'Generate individual video assets from a prompt or source media. Organize work into projects, choose a generation model, and review finished clips in your library.',
    example: 'Generate a short video shot from a product photo for a future campaign.',
    steps: ['Open a project', 'Describe the shot', 'Review the video'],
  },
  'motion-posts': {
    icon: Wand2,
    description: 'Bring a still image to life as a short animated social post. Upload your image, describe how it should move, and add a caption before generating the animation.',
    example: 'Give a plant photo a gentle camera move and a caption for Instagram.',
    steps: ['Upload an image', 'Set motion and caption', 'Review and animate'],
  },
  'promo-studio': {
    icon: Clapperboard,
    description: 'Build a guided promotional video for your app or product. Shape the story, review product footage, and bring voice, music, and visuals together with approval steps.',
    example: 'Make a launch video that shows your app and explains its main benefit.',
    steps: ['Define the story', 'Review the assets', 'Approve the preview'],
  },
  'post-scheduler': {
    icon: CalendarClock,
    description: 'Queue finished images and videos for publishing. Add captions, choose connected social accounts, and set the date and time each post should go out.',
    example: 'Schedule three finished posts to publish throughout the week.',
    steps: ['Add finished media', 'Set caption and time', 'Track publishing'],
  },
  'card-studio': {
    icon: LayoutTemplate,
    description: 'Create designed social graphics where the words are the focus. Turn a quote, verse, statement, or statistic into a styled card with a clear, readable layout.',
    example: 'Turn an encouraging quote into a branded Instagram card.',
    steps: ['Describe your card', 'Review concepts', 'Approve a design'],
  },
  'ad-performance': {
    icon: TrendingUp,
    description: 'See which paid ad creative earns results. Import Meta Ads Manager data and compare the headlines, templates, and angles behind your campaigns.',
    example: 'Compare two ad designs before deciding which one deserves more budget.',
    steps: ['Import ad results', 'Compare creatives', 'Find what works'],
  },
  'post-performance': {
    icon: Award,
    description: 'Learn how your published organic posts perform. Review available engagement results and see which content and card designs earn attention, saves, and shares.',
    example: 'Check which recent Instagram cards people saved or shared most.',
    steps: ['Review published posts', 'Compare engagement', 'Spot useful patterns'],
  },
  'clip-studio': {
    icon: Film,
    description: 'Turn source material into a short-form video. Start with links, text, or files, review a script and supporting visuals, then prepare the clip for publishing.',
    example: 'Turn an article or a set of notes into a scripted YouTube Short.',
    steps: ['Add your sources', 'Review script and shots', 'Render the clip'],
  },
  'trellis-studio': {
    icon: Music,
    description: 'Produce original music in a guided session. Plan tracks, generate and review each one, and combine approved tracks into a finished master.',
    example: 'Create a relaxing background soundtrack for a gardening video.',
    steps: ['Plan the session', 'Generate and review', 'Build the master'],
  },
  'trellis-episodes': {
    icon: Clapperboard,
    description: 'Assemble a complete episode through a staged production workflow. Bring together music, artwork, video, and publishing details, reviewing each phase as you go.',
    example: 'Take a finished music session through artwork and video to a release-ready episode.',
    steps: ['Start an episode', 'Review each phase', 'Prepare the release'],
  },
};
