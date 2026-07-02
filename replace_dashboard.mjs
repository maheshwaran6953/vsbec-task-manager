import fs from 'fs';

const file = 'src/App.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

// Lines 1291-1527 (0-indexed: 1290-1526) contain old two explorers + blue card
// We'll replace them with the unified analyzer

const newRightColumn = `                      {/* Right Column: Unified Department Analyzer */}
                      <div className="lg:col-span-8 space-y-10">
                        <Card className="p-0 overflow-hidden rounded-[2.5rem] border-zinc-100 shadow-xl bg-white">
                          {/* Header */}
                          <div className="p-8 border-b border-zinc-100 bg-zinc-50/50">
                            <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Department Analyzer</h3>
                            <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest mt-1">Filter by class, event and completion status</p>
                          </div>

                          {/* Filter Bar */}
                          <div className="px-8 pt-6 pb-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-white border-b border-zinc-100">
                            <div>
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Filter by Class</label>
                              <select
                                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={analyzerClassFilter}
                                onChange={e => setAnalyzerClassFilter(e.target.value)}
                              >
                                <option value="">All Classes</option>
                                {hodStats?.classStats.map((c: any) => (
                                  <option key={c.id} value={c.id.toString()}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Filter by Event</label>
                              <select
                                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={analyzerTaskFilter}
                                onChange={e => setAnalyzerTaskFilter(e.target.value)}
                              >
                                <option value="">All Events</option>
                                {hodStats?.taskStats.map((t: any) => (
                                  <option key={t.id} value={t.id.toString()}>{t.title}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Completion Status</label>
                              <select
                                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={analyzerStatusFilter}
                                onChange={e => setAnalyzerStatusFilter(e.target.value as any)}
                              >
                                <option value="ALL">All Students</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="PENDING">Not Submitted</option>
                              </select>
                            </div>
                          </div>

                          {/* Results */}
                          <div className="overflow-x-auto">
                            {(() => {
                              const deptStudents = users.filter(u => {
                                if (u.role !== 'STUDENT') return false;
                                if (analyzerClassFilter) return u.class_id?.toString() === analyzerClassFilter;
                                return hodStats?.classStats.some((c: any) => c.id.toString() === u.class_id?.toString());
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
                                  const totalTasks = hodStats?.taskStats.length || 0;
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
                                <>
                                  <div className="px-8 py-3 flex flex-wrap gap-3 border-b border-zinc-100 bg-zinc-50/30">
                                    <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-zinc-200 shadow-sm">
                                      <Users size={12} className="text-zinc-400" />
                                      <span className="text-[11px] font-black text-zinc-700">{enriched.length} Students</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                                      <CheckCircle2 size={12} className="text-emerald-500" />
                                      <span className="text-[11px] font-black text-emerald-700">{completedCount} Completed</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
                                      <XCircle size={12} className="text-red-400" />
                                      <span className="text-[11px] font-black text-red-700">{pendingCount} Not Submitted</span>
                                    </div>
                                    {enriched.length > 0 && (
                                      <div className="flex items-center gap-1.5 bg-zinc-900 px-3 py-1.5 rounded-full">
                                        <span className="text-[11px] font-black text-white">{Math.round((completedCount / enriched.length) * 100)}% Completion Rate</span>
                                      </div>
                                    )}
                                  </div>

                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-zinc-100 bg-zinc-50/40">
                                        <th className="px-8 py-3 text-[10px] uppercase font-black tracking-widest text-zinc-400">Student</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-zinc-400">Class</th>
                                        <th className="px-4 py-3 text-[10px] uppercase font-black tracking-widest text-zinc-400 text-center">
                                          {analyzerTaskFilter ? 'Submission Status' : 'Overall Progress'}
                                        </th>
                                        <th className="px-8 py-3 text-[10px] uppercase font-black tracking-widest text-zinc-400 text-right">Progress</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100">
                                      {filtered.length === 0 ? (
                                        <tr>
                                          <td colSpan={4} className="px-8 py-12 text-center text-xs font-bold text-zinc-400 uppercase tracking-widest">
                                            No students match the selected filters.
                                          </td>
                                        </tr>
                                      ) : filtered.map(student => {
                                        const isCompleted = student.submissionStatus === 'VERIFIED' || student.submissionStatus === 'SUBMITTED';
                                        const isRejected = student.submissionStatus === 'REJECTED';
                                        const progressVal = analyzerTaskFilter
                                          ? (isCompleted ? 100 : 0)
                                          : (() => {
                                              const totalTasks = hodStats?.taskStats.length || 1;
                                              const done = submissions.filter(s => s.student_name === student.full_name && (s.status === 'VERIFIED' || s.status === 'SUBMITTED')).length;
                                              return Math.round((done / totalTasks) * 100);
                                            })();

                                        return (
                                          <tr key={student.id} className="hover:bg-zinc-50/50 transition-colors">
                                            <td className="px-8 py-4">
                                              <div className="flex items-center gap-3">
                                                <div className={cn(
                                                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0",
                                                  isCompleted ? "bg-emerald-100 text-emerald-700" : isRejected ? "bg-orange-100 text-orange-600" : "bg-zinc-100 text-zinc-500"
                                                )}>
                                                  {student.full_name.charAt(0)}
                                                </div>
                                                <div>
                                                  <p className="text-sm font-black text-zinc-900 leading-tight">{student.full_name}</p>
                                                  <p className="text-[10px] text-zinc-400 font-mono">{student.register_number}</p>
                                                </div>
                                              </div>
                                            </td>
                                            <td className="px-4 py-4">
                                              <span className="text-xs font-bold text-zinc-600 bg-zinc-100 px-2 py-1 rounded-lg">{student.clsName}</span>
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                              <span className={cn(
                                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                                student.submissionStatus === 'VERIFIED' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                                student.submissionStatus === 'SUBMITTED' ? "bg-blue-50 text-blue-700 border-blue-100" :
                                                student.submissionStatus === 'REJECTED' ? "bg-orange-50 text-orange-700 border-orange-100" :
                                                "bg-red-50 text-red-600 border-red-100"
                                              )}>
                                                <span className={cn("w-1.5 h-1.5 rounded-full",
                                                  student.submissionStatus === 'VERIFIED' ? "bg-emerald-500" :
                                                  student.submissionStatus === 'SUBMITTED' ? "bg-blue-500" :
                                                  student.submissionStatus === 'REJECTED' ? "bg-orange-500" : "bg-red-500"
                                                )} />
                                                {student.submissionLabel}
                                              </span>
                                            </td>
                                            <td className="px-8 py-4">
                                              <div className="flex items-center gap-2 justify-end">
                                                <span className="text-xs font-bold text-zinc-400 w-8 text-right">{progressVal}%</span>
                                                <div className="w-20 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                                  <div
                                                    className={cn("h-full transition-all duration-700", isCompleted ? "bg-emerald-500" : isRejected ? "bg-orange-400" : "bg-zinc-300")}
                                                    style={{ width: \`\${progressVal}%\` }}
                                                  />
                                                </div>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </>
                              );
                            })()}
                          </div>
                        </Card>
                      </div>`;

// Replace lines 1291-1527 (0-indexed 1290 to 1526 inclusive)
const before = lines.slice(0, 1290);
const after = lines.slice(1527);
const newLines = [...before, newRightColumn, ...after];

fs.writeFileSync(file, newLines.join('\n'), 'utf8');
console.log('Done. New total lines:', newLines.length);
