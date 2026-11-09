import { REVIEW_CHECKS } from '../../supabase/functions/_shared/project-room-proposal-review.mjs';
export function passingReview() {
 return {model:'test-chief',usage:{input_tokens:100,output_tokens:50},text:JSON.stringify({verdict:'pass',checks:Object.fromEntries(REVIEW_CHECKS.map(key=>[key,{status:'pass',reason:'Synthetic review confirms the bounded discovery task satisfies this check.'}])),issues:[],input_needed:[]})};
}
