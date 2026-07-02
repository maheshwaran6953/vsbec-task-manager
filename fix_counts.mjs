import { readFileSync, writeFileSync } from 'fs';

let src = readFileSync('src/App.tsx', 'utf8');

// Fix 1: submissionLabel count - deduplicate by task_id
const old1 = `const doneCount = studentSubs.filter(s => s.status === 'VERIFIED' || s.status === 'SUBMITTED').length;
                                   submissionLabel = \`\${doneCount} / \${totalTasks} Events\`;
                                   submissionStatus = doneCount === totalTasks && totalTasks > 0 ? 'VERIFIED' : doneCount > 0 ? 'SUBMITTED' : 'PENDING';`;
const new1 = `const doneCount = new Set(studentSubs.filter(s => s.status === 'VERIFIED' || s.status === 'SUBMITTED').map(s => s.task_id)).size;
                                   submissionLabel = \`\${doneCount} / \${totalTasks} Events\`;
                                   submissionStatus = doneCount === totalTasks && totalTasks > 0 ? 'VERIFIED' : doneCount > 0 ? 'SUBMITTED' : 'PENDING';`;

if (src.includes(old1)) {
    src = src.replace(old1, new1);
    console.log('✅ Fixed submissionLabel count (deduplication)');
} else {
    console.log('❌ Could not find submissionLabel pattern');
    // Fallback: regex-based replacement
    src = src.replace(
        /const doneCount = studentSubs\.filter\(s => s\.status === 'VERIFIED' \|\| s\.status === 'SUBMITTED'\)\.length;/g,
        `const doneCount = new Set(studentSubs.filter(s => s.status === 'VERIFIED' || s.status === 'SUBMITTED').map(s => s.task_id)).size;`
    );
    console.log('✅ Applied fallback regex fix for doneCount');
}

// Fix 2: progressVal calculation - deduplicate by task_id
src = src.replace(
    /const done = submissions\.filter\(s => s\.student_name === student\.full_name && \(s\.status === 'VERIFIED' \|\| s\.status === 'SUBMITTED'\)\)\.length;\s*return Math\.round\(\(done \/ totalTasks\) \* 100\);/g,
    `const doneIds = new Set(submissions.filter(s => s.student_name === student.full_name && (s.status === 'VERIFIED' || s.status === 'SUBMITTED')).map(s => s.task_id)).size;
                                             return Math.min(100, Math.round((doneIds / totalTasks) * 100));`
);
console.log('✅ Fixed progressVal calculation (deduplication)');

writeFileSync('src/App.tsx', src, 'utf8');
console.log('✅ Done! src/App.tsx updated.');
