import fs from 'fs';

const filePath = 'src/App.tsx';
let content = fs.readFileSync(filePath, 'utf8');
let lines = content.split('\n');

// 1. Definition of UnifiedAnalyzer component
const unifiedAnalyzerCode = `
  const UnifiedAnalyzer = ({ role, title }: { role: string, title: string }) => {
    // Determine context
    const isGlobal = role === 'SUPREME_ADMIN';
    const isDept = role === 'HOD';
    const isCls = role === 'CLASS_ADVISOR' || role === 'COORDINATOR';

    // Filters are already defined in App state: 
    // analyzerClassFilter, analyzerTaskFilter, analyzerStatusFilter, adminDeptFilter

    const currentDeptId = isGlobal ? adminDeptFilter : user?.department_id?.toString();
    const currentClassId = isCls ? (user?.class_id || myClass?.id)?.toString() : analyzerClassFilter;

    const deptStudents = users.filter(u => {
      if (u.role !== 'STUDENT') return false;
      if (isCls) return u.class_id?.toString() === currentClassId;
      if (currentDeptId) return u.department_id?.toString() === currentDeptId;
      return true; // For Admin if no dept selected
    }).filter(u => {
       if (!isCls && analyzerClassFilter) return u.class_id?.toString() === analyzerClassFilter;
       return true;
    });

    const enriched = deptStudents.map(student => {
      let submissionStatus = 'PENDING';
      let submissionLabel = 'Not Submitted';

      if (analyzerTaskFilter) {
        const sub = submissions.find(s =>
          s.student_name === student.full_name &&
          s.task_id?.toString() === analyzerTaskFilter
        );
        if (sub) {
          submissionStatus = sub.status;
          submissionLabel = sub.status === 'VERIFIED' ? 'Verified' : sub.status === 'REJECTED' ? 'Rejected' : 'Submitted';
        }
      } else {
        const studentSubs = submissions.filter(s => s.student_name === student.full_name);
        // Filter tasks visible to this student/context
        const visibleTasks = tasks.filter(t => {
            if (t.class_id && t.class_id.toString() !== student.class_id?.toString()) return false;
            if (t.department_id && t.department_id.toString() !== student.department_id?.toString() && !t.class_id) return false;
            return true;
        });
        const totalTasks = visibleTasks.length;
        const doneCount = studentSubs.filter(s => s.status === 'VERIFIED' || s.status === 'SUBMITTED').length;
        submissionLabel = \`\${doneCount} / \${totalTasks} Events\`;
        submissionStatus = doneCount === totalTasks && totalTasks > 0 ? 'VERIFIED' : doneCount > 0 ? 'SUBMITTED' : 'PENDING';
      }

      const clsName = hodStats?.classStats.find((c: any) => c.id.toString() === student.class_id?.toString())?.name || '—';
      return { ...student, submissionStatus, submissionLabel, clsName };
    });

    const filtered = enriched.filter(s => {
      if (analyzerStatusFilter === 'COMPLETED') return s.submissionStatus === 'VERIFIED' || s.submissionStatus === 'SUBMITTED';
      if (analyzerStatusFilter === 'PENDING') return s.submissionStatus === 'PENDING';
      return true;
    });

    const completedCount = enriched.filter(s => s.submissionStatus !== 'PENDING').length;
    const pendingCount = enriched.filter(s => s.submissionStatus === 'PENDING').length;

    return (
      <Card className="p-0 overflow-hidden rounded-[2.5rem] border-zinc-100 shadow-xl bg-white mt-10">
        <div className="p-8 border-b border-zinc-100 bg-zinc-50/50">
          <h3 className="text-2xl font-black text-zinc-900 tracking-tight">{title}</h3>
          <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest mt-1">Track student progress and events</p>
        </div>

        <div className="px-8 pt-6 pb-4 grid grid-cols-1 md:grid-cols-4 gap-4 bg-white border-b border-zinc-100">
          {isGlobal && (
            <div>
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Department</label>
              <select
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold"
                value={adminDeptFilter}
                onChange={e => setAdminDeptFilter(e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id.toString()}>{d.name}</option>)}
              </select>
            </div>
          )}
          {!isCls && (
            <div>
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Class</label>
              <select
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold"
                value={analyzerClassFilter}
                onChange={e => setAnalyzerClassFilter(e.target.value)}
              >
                <option value="">All Classes</option>
                {users.filter(u => u.role === 'CLASS_ADVISOR' && (!currentDeptId || u.department_id?.toString() === currentDeptId)).map(u => (
                  <option key={u.id} value={u.class_id?.toString()}>{u.full_name}'s Class</option>
                ))}
              </select>
            </div>
          )}
          <div className={cn(isGlobal ? "md:col-span-1" : isCls ? "md:col-span-2" : "md:col-span-1")}>
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Event</label>
            <select
              className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold"
              value={analyzerTaskFilter}
              onChange={e => setAnalyzerTaskFilter(e.target.value)}
            >
              <option value="">All Events</option>
              {tasks.filter(t => !currentDeptId || t.department_id?.toString() === currentDeptId || !t.department_id).map(t => (
                <option key={t.id} value={t.id.toString()}>{t.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Status</label>
            <select
              className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold"
              value={analyzerStatusFilter}
              onChange={e => setAnalyzerStatusFilter(e.target.value as any)}
            >
              <option value="ALL">All Students</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="px-8 py-3 flex flex-wrap gap-3 border-b border-zinc-100 bg-zinc-50/30">
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-zinc-200">
              <span className="text-[11px] font-black">{enriched.length} Students</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
              <span className="text-[11px] font-black text-emerald-700">{completedCount} Completed</span>
            </div>
            <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
              <span className="text-[11px] font-black text-red-700">{pendingCount} Pending</span>
            </div>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/40">
                <th className="px-8 py-3 text-[10px] uppercase font-black text-zinc-400">Student</th>
                <th className="px-4 py-3 text-[10px] uppercase font-black text-zinc-400 text-center">Status</th>
                <th className="px-8 py-3 text-[10px] uppercase font-black text-zinc-400 text-right">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map(student => {
                 const isCompleted = student.submissionStatus === 'VERIFIED' || student.submissionStatus === 'SUBMITTED';
                 const progressVal = analyzerTaskFilter ? (isCompleted ? 100 : 0) : Math.round((submissions.filter(s => s.student_name === student.full_name && (s.status === 'VERIFIED' || s.status === 'SUBMITTED')).length / (tasks.length || 1)) * 100);
                 return (
                  <tr key={student.id} className="hover:bg-zinc-50/50 transition-colors text-sm">
                    <td className="px-8 py-4 font-bold text-zinc-900">{student.full_name} <span className="text-[10px] text-zinc-400 font-mono ml-2">{student.register_number}</span></td>
                    <td className="px-4 py-4 text-center">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border",
                        student.submissionStatus === 'VERIFIED' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                      )}>{student.submissionLabel}</span>
                    </td>
                    <td className="px-8 py-4 text-right font-black text-zinc-400">{progressVal}%</td>
                  </tr>
                 );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  };
`;

// Find where to inject UnifiedAnalyzer (after state hooks)
const injectIndex = lines.findIndex(l => l.includes('const isHOD = user?.role === \'HOD\';'));
lines.splice(injectIndex + 1, 0, unifiedAnalyzerCode);

// Helper to replace block between start and matching closing brace
function replaceBraceBlock(linesArr, searchStr, newContent) {
    let startIndex = linesArr.findIndex(l => l.includes(searchStr));
    if (startIndex === -1) return;

    let depth = 0;
    let endIndex = -1;
    for (let i = startIndex; i < linesArr.length; i++) {
        depth += (linesArr[i].match(/{/g) || []).length;
        depth -= (linesArr[i].match(/}/g) || []).length;
        if (depth === 0) {
            endIndex = i;
            break;
        }
    }

    if (endIndex !== -1) {
        linesArr.splice(startIndex, endIndex - startIndex + 1, newContent);
    }
}

// 2. Replace isAdmin dashboard
// Find the block: {isAdmin ? ( ... ) : isHOD ? ( ... ) }
// This is tricky because it's part of a ternary. 
// Let's replace the content inside the isAdmin branch.
let adminStartIndex = lines.findIndex(l => l.includes('{isAdmin ? ('));
let adminEndIndex = lines.findIndex(l => l.includes(') : isHOD ? ('));
if (adminStartIndex !== -1 && adminEndIndex !== -1) {
    lines.splice(adminStartIndex + 1, adminEndIndex - adminStartIndex - 1, '                  <UnifiedAnalyzer role="SUPREME_ADMIN" title="Global System Analyzer" />');
}

// 3. Replace isCoordinator dashboard
replaceBraceBlock(lines, '{isCoordinator && (', '                    <UnifiedAnalyzer role="COORDINATOR" title="Class Achievement Analyzer" />');

// 4. Replace isAdvisor dashboard
replaceBraceBlock(lines, '{isAdvisor && advisorStats && (', '                    <UnifiedAnalyzer role="CLASS_ADVISOR" title="Class Performance Analyzer" />');

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Update complete.');
