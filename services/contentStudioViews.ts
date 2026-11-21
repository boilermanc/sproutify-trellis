import type { ViewState } from '../types';

export const CONTENT_STUDIO_VIEWS: Partial<Record<ViewState, { title: string; branchRequired: boolean; nextAction: string }>> = {
  'social-hub': { title: 'Social Hub', branchRequired: true, nextAction: 'Choose the branch you want to work on, then connect a channel or create a social post.' },
  'content-intelligence': { title: 'Content Intelligence', branchRequired: true, nextAction: 'Choose a branch, then review its brand brief or research a content idea.' },
  'reddit-growth': { title: 'Reddit Ads', branchRequired: true, nextAction: 'Choose a branch, then select an ad account and the advertising task you want to work on.' },
  'video-ad-lab': { title: 'Creative Studio', branchRequired: true, nextAction: 'Choose a branch, then pick the kind of creative you want to make.' },
  'media-generation': { title: 'Media Generation', branchRequired: true, nextAction: 'Choose a branch, then start a media project or open existing work.' },
  'motion-posts': { title: 'Motion Posts', branchRequired: true, nextAction: 'Choose a branch, then upload an image. We will guide you through the motion, caption, and animation settings.' },
  'promo-studio': { title: 'Promo Studio', branchRequired: true, nextAction: 'Choose a branch, then start a promo or continue an existing project.' },
  'post-scheduler': { title: 'Post Scheduler', branchRequired: true, nextAction: 'Choose a branch, then create a post or review its publishing schedule.' },
  'card-studio': { title: 'Card Studio', branchRequired: true, nextAction: 'Choose a branch, then describe the card you want to create.' },
  'ad-performance': { title: 'Ad Performance', branchRequired: true, nextAction: 'Choose a branch to review its advertising results and connected accounts.' },
  'post-performance': { title: 'Post Performance', branchRequired: true, nextAction: 'Choose a branch to review its published posts and available results.' },
  'clip-studio': { title: 'Clip Studio', branchRequired: true, nextAction: 'Choose a branch, then start a clip or continue an existing project.' },
  'transcriptions': { title: 'Transcriptions', branchRequired: false, nextAction: '' },
  'trellis-studio': { title: 'Trellis Sessions', branchRequired: true, nextAction: 'Choose a branch, then create a session or continue one from its library.' },
  'studio-albums': { title: 'Studio Albums', branchRequired: false, nextAction: '' },
  'trellis-episodes': { title: 'Trellis Episodes', branchRequired: true, nextAction: 'Choose a branch, then create an episode or continue existing work.' },
};
