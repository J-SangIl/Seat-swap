/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  Users, 
  Grid3X3, 
  Layout, 
  CheckCircle2, 
  Shuffle, 
  RotateCcw, 
  ArrowRight, 
  UserPlus,
  Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

interface Student {
  id: number;
  name: string;
  isFrontGroup: boolean;
}

interface ClassData {
  className: string;
  students: Student[];
}

interface Seat {
  index: number;
  isFrontSeat: boolean;
  studentId?: number;
}

type Step = 'UPLOAD' | 'SELECT_CLASS' | 'SELECT_FRONT_GROUP' | 'SELECT_FRONT_SEATS' | 'ARRANGE';

export default function App() {
  const [step, setStep] = useState<Step>('UPLOAD');
  const [allClasses, setAllClasses] = useState<ClassData[]>([]);
  const [selectedClassIndex, setSelectedClassIndex] = useState<number | null>(null);
  const [layoutCols, setLayoutCols] = useState<5 | 6>(6);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [isFrontGroupRandomized, setIsFrontGroupRandomized] = useState(false);
  const [isOthersRandomized, setIsOthersRandomized] = useState(false);

  const [isShufflingFront, setIsShufflingFront] = useState(false);
  const [isShufflingOthers, setIsShufflingOthers] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedSeatIndex, setSelectedSeatIndex] = useState<number | null>(null);

  const currentClass = selectedClassIndex !== null ? allClasses[selectedClassIndex] : null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const bstr = event.target?.result;
      const workbook = XLSX.read(bstr, { type: 'binary' });
      
      const classes: ClassData[] = workbook.SheetNames.map(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        // Filter rows where the first column is a number (skipping headers)
        const students: Student[] = data
          .filter(row => row.length >= 2 && typeof row[0] === 'number')
          .map(row => ({
            id: Number(row[0]),
            name: String(row[1]),
            isFrontGroup: false
          }));

        return {
          className: sheetName,
          students
        };
      });

      setAllClasses(classes);
      setStep('SELECT_CLASS');
    };
    reader.readAsBinaryString(file);
  };

  const initSeats = useCallback((cols: 5 | 6) => {
    if (!currentClass) return;
    const totalStudents = currentClass.students.length;
    const rows = Math.ceil(totalStudents / cols);
    const totalSeats = rows * cols;
    
    const newSeats: Seat[] = Array.from({ length: totalSeats }, (_, i) => ({
      index: i,
      isFrontSeat: false
    }));
    setSeats(newSeats);
  }, [currentClass]);

  const toggleFrontGroup = (studentId: number) => {
    if (!currentClass) return;
    const updatedClasses = [...allClasses];
    const students = [...updatedClasses[selectedClassIndex!].students];
    const studentIdx = students.findIndex(s => s.id === studentId);
    if (studentIdx !== -1) {
      students[studentIdx] = { 
        ...students[studentIdx], 
        isFrontGroup: !students[studentIdx].isFrontGroup 
      };
      updatedClasses[selectedClassIndex!] = { 
        ...updatedClasses[selectedClassIndex!], 
        students 
      };
      setAllClasses(updatedClasses);
    }
  };

  const toggleFrontSeat = (seatIndex: number) => {
    const frontGroupCount = currentClass?.students.filter(s => s.isFrontGroup).length || 0;
    const currentFrontSeatsCount = seats.filter(s => s.isFrontSeat).length;
    
    setSeats(prev => {
      const next = [...prev];
      if (next[seatIndex].isFrontSeat) {
        next[seatIndex] = { ...next[seatIndex], isFrontSeat: false };
      } else if (currentFrontSeatsCount < frontGroupCount) {
        next[seatIndex] = { ...next[seatIndex], isFrontSeat: true };
      }
      return next;
    });
  };

  // Helper for shuffle animation
  const runShuffleAnimation = async (
    targetIndices: number[], 
    studentPool: Student[], 
    setShuffling: (val: boolean) => void,
    onComplete: (finalAssignments: { index: number, studentId: number }[]) => void
  ) => {
    setShuffling(true);
    const iterations = 12;
    const interval = 80;

    for (let i = 0; i < iterations; i++) {
      const tempAssignments = targetIndices.map(idx => ({
        index: idx,
        studentId: studentPool[Math.floor(Math.random() * studentPool.length)].id
      }));
      
      setSeats(prev => {
        const next = [...prev];
        tempAssignments.forEach(ta => {
          next[ta.index] = { ...next[ta.index], studentId: ta.studentId };
        });
        return next;
      });
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    // Final shuffle and assignment
    const shuffledStudents = [...studentPool].sort(() => Math.random() - 0.5);
    const finalAssignments = targetIndices.map((idx, i) => ({
      index: idx,
      studentId: i < shuffledStudents.length ? shuffledStudents[i].id : -1 // -1 for empty
    }));

    onComplete(finalAssignments);
    setShuffling(false);
  };

  // Randomize Front Group
  const randomizeFrontGroup = async () => {
    if (!currentClass || isShufflingFront) return;
    setSelectedSeatIndex(null);
    const frontStudents = currentClass.students.filter(s => s.isFrontGroup);
    const frontSeatIndices = seats.filter(s => s.isFrontSeat).map(s => s.index);
    
    await runShuffleAnimation(
      frontSeatIndices, 
      frontStudents, 
      setIsShufflingFront,
      (final) => {
        setSeats(prev => {
          const next = [...prev];
          final.forEach(f => {
            next[f.index] = { ...next[f.index], studentId: f.studentId === -1 ? undefined : f.studentId };
          });
          return next;
        });
        setIsFrontGroupRandomized(true);
      }
    );
  };

  // Randomize Others
  const randomizeOthers = async () => {
    if (!currentClass || isShufflingOthers) return;
    setSelectedSeatIndex(null);
    const otherStudents = currentClass.students.filter(s => !s.isFrontGroup);
    const otherSeatIndices = seats.filter(s => !s.isFrontSeat).map(s => s.index);
    
    await runShuffleAnimation(
      otherSeatIndices, 
      otherStudents, 
      setIsShufflingOthers,
      (final) => {
        setSeats(prev => {
          const next = [...prev];
          final.forEach(f => {
            next[f.index] = { ...next[f.index], studentId: f.studentId === -1 ? undefined : f.studentId };
          });
          return next;
        });
        setIsOthersRandomized(true);
      }
    );
  };

  const resetArrangement = () => {
    const newSeats = seats.map(s => ({ ...s, studentId: undefined }));
    setSeats(newSeats);
    setIsFrontGroupRandomized(false);
    setIsOthersRandomized(false);
    setSelectedSeatIndex(null);
  };

  const handleSeatClick = (index: number) => {
    if (selectedSeatIndex === null) {
      setSelectedSeatIndex(index);
    } else {
      if (selectedSeatIndex !== index) {
        setSeats(prev => {
          const next = [...prev];
          const temp = next[selectedSeatIndex].studentId;
          next[selectedSeatIndex] = { ...next[selectedSeatIndex], studentId: next[index].studentId };
          next[index] = { ...next[index], studentId: temp };
          return next;
        });
      }
      setSelectedSeatIndex(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#202124] font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#1A73E8] flex items-center gap-2">
              <Layout className="w-8 h-8" />
              교실 자리 바꾸기 매니저
            </h1>
            <p className="text-sm text-[#5F6368] mt-1">공정하고 재미있는 자리 배치를 도와드립니다.</p>
          </div>
          {step !== 'UPLOAD' && (
            <button 
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 text-sm font-medium text-[#5F6368] hover:text-[#1A73E8] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              처음으로
            </button>
          )}
        </header>

        {/* Main Content */}
        <main className="bg-white rounded-2xl shadow-sm border border-[#DADCE0] overflow-hidden">
          <AnimatePresence mode="wait">
            {/* Step 1: Upload */}
            {step === 'UPLOAD' && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="p-12 text-center"
              >
                <div className="w-20 h-20 bg-[#E8F0FE] rounded-full flex items-center justify-center mx-auto mb-6">
                  <Upload className="w-10 h-10 text-[#1A73E8]" />
                </div>
                <h2 className="text-2xl font-semibold mb-4">학생 명렬표 업로드</h2>
                <p className="text-[#5F6368] mb-8 max-w-md mx-auto">
                  엑셀 파일을 업로드해주세요.<br />
                  시트명은 <b>반 이름</b>, 첫 번째 열은 <b>번호</b>, 두 번째 열은 <b>이름</b>이어야 합니다.
                </p>
                <label className="inline-flex items-center gap-2 px-6 py-3 bg-[#1A73E8] text-white rounded-full font-medium cursor-pointer hover:bg-[#1765CC] transition-colors shadow-md">
                  <Upload className="w-5 h-5" />
                  파일 선택하기
                  <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                </label>
              </motion.div>
            )}

            {/* Step 2: Select Class & Layout */}
            {step === 'SELECT_CLASS' && (
              <motion.div 
                key="select-class"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8"
              >
                <div className="flex items-center gap-2 mb-6 text-[#1A73E8]">
                  <Users className="w-6 h-6" />
                  <h2 className="text-xl font-bold">반 및 레이아웃 선택</h2>
                </div>
                
                <div className="grid md:grid-cols-2 gap-8">
                  <section>
                    <h3 className="text-sm font-semibold text-[#5F6368] uppercase tracking-wider mb-4">반 선택</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {allClasses.map((cls, idx) => (
                        <button
                          key={cls.className}
                          onClick={() => setSelectedClassIndex(idx)}
                          className={cn(
                            "p-4 rounded-xl border text-left transition-all",
                            selectedClassIndex === idx 
                              ? "border-[#1A73E8] bg-[#E8F0FE] text-[#1A73E8] ring-2 ring-[#1A73E8]/20" 
                              : "border-[#DADCE0] hover:border-[#1A73E8] hover:bg-gray-50"
                          )}
                        >
                          <span className="block font-bold text-lg">{cls.className}</span>
                          <span className="text-xs opacity-70">{cls.students.length}명</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold text-[#5F6368] uppercase tracking-wider mb-4">책상 배치 방식</h3>
                    <div className="space-y-4">
                      <button
                        onClick={() => setLayoutCols(5)}
                        className={cn(
                          "w-full p-4 rounded-xl border flex items-center gap-4 transition-all",
                          layoutCols === 5 
                            ? "border-[#1A73E8] bg-[#E8F0FE] text-[#1A73E8]" 
                            : "border-[#DADCE0] hover:border-[#1A73E8]"
                        )}
                      >
                        <div className="w-12 h-12 bg-white rounded-lg border flex items-center justify-center">
                          <Grid3X3 className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                          <span className="block font-bold">5열 (개별 좌석)</span>
                          <span className="text-xs opacity-70">짝꿍 없이 5열로 배치합니다.</span>
                        </div>
                      </button>

                      <button
                        onClick={() => setLayoutCols(6)}
                        className={cn(
                          "w-full p-4 rounded-xl border flex items-center gap-4 transition-all",
                          layoutCols === 6 
                            ? "border-[#1A73E8] bg-[#E8F0FE] text-[#1A73E8]" 
                            : "border-[#DADCE0] hover:border-[#1A73E8]"
                        )}
                      >
                        <div className="w-12 h-12 bg-white rounded-lg border flex items-center justify-center">
                          <Users className="w-6 h-6" />
                        </div>
                        <div className="text-left">
                          <span className="block font-bold">6열 (3분단 짝꿍)</span>
                          <span className="text-xs opacity-70">짝꿍이 있는 3분단 형태로 배치합니다.</span>
                        </div>
                      </button>
                    </div>
                  </section>
                </div>

                <div className="mt-12 flex justify-end">
                  <button
                    disabled={selectedClassIndex === null}
                    onClick={() => {
                      initSeats(layoutCols);
                      setStep('SELECT_FRONT_GROUP');
                    }}
                    className="flex items-center gap-2 px-8 py-3 bg-[#1A73E8] text-white rounded-full font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1765CC] transition-all shadow-md"
                  >
                    다음 단계
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Select Front Group */}
            {step === 'SELECT_FRONT_GROUP' && currentClass && (
              <motion.div 
                key="select-front"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 text-[#1A73E8]">
                    <UserPlus className="w-6 h-6" />
                    <h2 className="text-xl font-bold">앞자리 희망 학생 선택</h2>
                  </div>
                  <div className="px-4 py-2 bg-[#E8F0FE] text-[#1A73E8] rounded-full text-sm font-bold">
                    선택됨: {currentClass.students.filter(s => s.isFrontGroup).length}명
                  </div>
                </div>

                <p className="text-[#5F6368] mb-6">앞자리에 우선적으로 배치할 학생들을 클릭하여 선택해주세요.</p>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[400px] overflow-y-auto p-2 border rounded-xl bg-gray-50">
                  {currentClass.students.map(student => (
                    <button
                      key={student.id}
                      onClick={() => toggleFrontGroup(student.id)}
                      className={cn(
                        "p-3 rounded-lg border text-sm font-medium transition-all flex items-center justify-between",
                        student.isFrontGroup 
                          ? "bg-[#1A73E8] text-white border-[#1A73E8] shadow-sm" 
                          : "bg-white text-[#3C4043] border-[#DADCE0] hover:border-[#1A73E8]"
                      )}
                    >
                      <span>{student.id}. {student.name}</span>
                      {student.isFrontGroup && <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  ))}
                </div>

                <div className="mt-8 flex justify-between">
                  <button
                    onClick={() => setStep('SELECT_CLASS')}
                    className="px-6 py-3 border border-[#DADCE0] text-[#5F6368] rounded-full font-medium hover:bg-gray-50 transition-all"
                  >
                    이전으로
                  </button>
                  <button
                    onClick={() => setStep('SELECT_FRONT_SEATS')}
                    className="flex items-center gap-2 px-8 py-3 bg-[#1A73E8] text-white rounded-full font-medium hover:bg-[#1765CC] transition-all shadow-md"
                  >
                    다음 단계
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Select Front Seats */}
            {step === 'SELECT_FRONT_SEATS' && (
              <motion.div 
                key="select-seats"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2 text-[#1A73E8]">
                    <Grid3X3 className="w-6 h-6" />
                    <h2 className="text-xl font-bold">앞자리 위치 지정</h2>
                  </div>
                  <div className="px-4 py-2 bg-[#E8F0FE] text-[#1A73E8] rounded-full text-sm font-bold">
                    남은 좌석: {(currentClass?.students.filter(s => s.isFrontGroup).length || 0) - seats.filter(s => s.isFrontSeat).length}개
                  </div>
                </div>

                <p className="text-[#5F6368] mb-8">배치표에서 앞자리로 사용할 위치를 클릭하여 선택해주세요. (칠판 쪽이 위쪽입니다)</p>

                <div className="relative flex justify-center items-end mb-12 px-4">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-64 py-3 bg-[#DADCE0] text-[#5F6368] text-center rounded-lg font-bold text-lg uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm">
                      <Monitor className="w-6 h-6" />
                      교탁 (칠판)
                    </div>
                  </div>
                  <div className="absolute right-4 border-2 border-[#DADCE0] p-2 rounded text-[10px] font-bold text-[#5F6368] uppercase">
                    앞문
                  </div>
                </div>

                <div 
                  className={cn(
                    "grid gap-3 max-w-4xl mx-auto",
                    layoutCols === 6 ? "grid-cols-3" : "grid-cols-5"
                  )}
                >
                  {layoutCols === 6 ? (
                    // 6-column sectioned layout
                    [0, 1, 2].map(sectionIdx => (
                      <div key={sectionIdx} className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded-xl border border-[#DADCE0]">
                        {Array.from({ length: Math.ceil(seats.length / 6) }).map((_, rowIdx) => (
                          <React.Fragment key={rowIdx}>
                            {[0, 1].map(colOffset => {
                              const seatIdx = rowIdx * 6 + sectionIdx * 2 + colOffset;
                              const seat = seats[seatIdx];
                              if (!seat) return <div key={colOffset} className="aspect-[3/2]" />;
                              return (
                                <button
                                  key={seatIdx}
                                  onClick={() => toggleFrontSeat(seatIdx)}
                                  className={cn(
                                    "aspect-[3/2] rounded-lg border-2 transition-all flex items-center justify-center text-xs font-bold",
                                    seat.isFrontSeat 
                                      ? "bg-[#E8F0FE] border-[#1A73E8] text-[#1A73E8] shadow-inner" 
                                      : "bg-white border-[#DADCE0] text-[#DADCE0] hover:border-[#1A73E8]"
                                  )}
                                >
                                  {seat.isFrontSeat ? "앞" : seatIdx + 1}
                                </button>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    ))
                  ) : (
                    // 5-column standard layout
                    seats.map((seat, i) => (
                      <button
                        key={seat.index}
                        onClick={() => toggleFrontSeat(i)}
                        className={cn(
                          "aspect-[3/2] rounded-xl border-2 transition-all flex items-center justify-center text-xs font-bold",
                          seat.isFrontSeat 
                            ? "bg-[#E8F0FE] border-[#1A73E8] text-[#1A73E8] shadow-inner" 
                            : "bg-white border-[#DADCE0] text-[#DADCE0] hover:border-[#1A73E8]"
                        )}
                      >
                        {seat.isFrontSeat ? "앞" : i + 1}
                      </button>
                    ))
                  )}
                </div>

                <div className="mt-12 flex justify-between">
                  <button
                    onClick={() => setStep('SELECT_FRONT_GROUP')}
                    className="px-6 py-3 border border-[#DADCE0] text-[#5F6368] rounded-full font-medium hover:bg-gray-50 transition-all"
                  >
                    이전으로
                  </button>
                  <button
                    disabled={seats.filter(s => s.isFrontSeat).length !== (currentClass?.students.filter(s => s.isFrontGroup).length || 0)}
                    onClick={() => setStep('ARRANGE')}
                    className="flex items-center gap-2 px-8 py-3 bg-[#1A73E8] text-white rounded-full font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#1765CC] transition-all shadow-md"
                  >
                    배치 시작하기
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 5: Final Arrangement */}
            {step === 'ARRANGE' && currentClass && (
              <motion.div 
                key="arrange"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                  <div className="flex items-center gap-2 text-[#1A73E8]">
                    <Shuffle className="w-6 h-6" />
                    <h2 className="text-xl font-bold">{currentClass.className} 자리 배치</h2>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <p className="w-full text-xs text-[#5F6368] mb-1 md:text-right italic">
                      * 자리를 바꾸려면 두 좌석을 차례대로 클릭하세요.
                    </p>
                    <button
                      onClick={randomizeFrontGroup}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all",
                        isFrontGroupRandomized 
                          ? "bg-green-100 text-green-700 border border-green-200" 
                          : "bg-[#1A73E8] text-white hover:bg-[#1765CC] shadow-sm"
                      )}
                    >
                      <Shuffle className="w-4 h-4" />
                      앞자리 랜덤 배치
                    </button>
                    <button
                      onClick={randomizeOthers}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all",
                        isOthersRandomized 
                          ? "bg-green-100 text-green-700 border border-green-200" 
                          : "bg-[#1A73E8] text-white hover:bg-[#1765CC] shadow-sm"
                      )}
                    >
                      <Shuffle className="w-4 h-4" />
                      나머지 랜덤 배치
                    </button>
                    <button
                      onClick={() => setShowPrintModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-[#1A73E8] text-[#1A73E8] rounded-full text-sm font-bold hover:bg-[#E8F0FE]"
                    >
                      <Monitor className="w-4 h-4" />
                      교탁용 화면 (180도)
                    </button>
                    <button
                      onClick={() => setStep('SELECT_FRONT_SEATS')}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-[#DADCE0] text-[#5F6368] rounded-full text-sm font-bold hover:bg-gray-50"
                    >
                      <Grid3X3 className="w-4 h-4" />
                      앞자리 다시 지정
                    </button>
                    <button
                      onClick={resetArrangement}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-[#DADCE0] text-[#5F6368] rounded-full text-sm font-bold hover:bg-gray-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      초기화
                    </button>
                  </div>
                </div>

                <div className="relative flex justify-center items-end mb-12 px-4">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-64 py-3 bg-[#DADCE0] text-[#5F6368] text-center rounded-lg font-bold text-lg uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm">
                      <Monitor className="w-6 h-6" />
                      교탁 (칠판)
                    </div>
                  </div>
                  <div className="absolute right-4 border-2 border-[#DADCE0] p-2 rounded text-[10px] font-bold text-[#5F6368] uppercase">
                    앞문
                  </div>
                </div>

                <div 
                  className={cn(
                    "grid gap-8 max-w-5xl mx-auto",
                    layoutCols === 6 ? "grid-cols-3" : "grid-cols-5"
                  )}
                >
                  {layoutCols === 6 ? (
                    // 6-column sectioned layout
                    [0, 1, 2].map(sectionIdx => (
                      <div key={sectionIdx} className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-2xl border-2 border-[#DADCE0] shadow-sm">
                        {Array.from({ length: Math.ceil(seats.length / 6) }).map((_, rowIdx) => (
                          <React.Fragment key={rowIdx}>
                            {[0, 1].map(colOffset => {
                              const seatIdx = rowIdx * 6 + sectionIdx * 2 + colOffset;
                              const seat = seats[seatIdx];
                              if (!seat) return <div key={colOffset} className="aspect-[4/3]" />;
                              const student = currentClass.students.find(s => s.id === seat.studentId);
                              return (
                                <motion.button
                                  key={seatIdx}
                                  layout
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  onClick={() => handleSeatClick(seatIdx)}
                                  className={cn(
                                    "aspect-[4/3] rounded-xl border-2 flex flex-col items-center justify-center p-2 transition-all cursor-pointer",
                                    seat.isFrontSeat ? "border-[#1A73E8]/30 bg-[#E8F0FE]/50" : "border-[#DADCE0] bg-white",
                                    student ? "shadow-md" : "border-dashed opacity-40",
                                    selectedSeatIndex === seatIdx && "ring-4 ring-[#1A73E8] border-[#1A73E8] z-10"
                                  )}
                                >
                                  {student ? (
                                    <>
                                      <span className="text-xs text-[#5F6368] font-bold mb-1">{student.id}번</span>
                                      <span className="text-sm md:text-base font-bold text-[#202124]">{student.name}</span>
                                      {seat.isFrontSeat && (
                                        <span className="mt-1 px-1.5 py-0.5 bg-[#1A73E8] text-white text-[7px] rounded font-bold uppercase">Front</span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs text-[#DADCE0] font-bold">{seatIdx + 1}</span>
                                  )}
                                </motion.button>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    ))
                  ) : (
                    // 5-column standard layout
                    seats.map((seat, i) => {
                      const student = currentClass.students.find(s => s.id === seat.studentId);
                      return (
                        <motion.button
                          key={seat.index}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={() => handleSeatClick(i)}
                          className={cn(
                            "aspect-[4/3] rounded-xl border-2 flex flex-col items-center justify-center p-2 transition-all cursor-pointer",
                            seat.isFrontSeat ? "border-[#1A73E8]/30 bg-[#E8F0FE]/50" : "border-[#DADCE0] bg-white",
                            student ? "shadow-md" : "border-dashed opacity-40",
                            selectedSeatIndex === i && "ring-4 ring-[#1A73E8] border-[#1A73E8] z-10"
                          )}
                        >
                          {student ? (
                            <>
                              <span className="text-xs text-[#5F6368] font-bold mb-1">{student.id}번</span>
                              <span className="text-sm md:text-base font-bold text-[#202124]">{student.name}</span>
                              {seat.isFrontSeat && (
                                <span className="mt-1 px-1.5 py-0.5 bg-[#1A73E8] text-white text-[7px] rounded font-bold uppercase">Front</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-[#DADCE0] font-bold">{i + 1}</span>
                          )}
                        </motion.button>
                      );
                    })
                  )}
                </div>

                <div className="mt-12 p-6 bg-[#F1F3F4] rounded-2xl border border-[#DADCE0]">
                  <h3 className="text-sm font-bold text-[#5F6368] mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    배치 요약
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-3 rounded-lg border border-[#DADCE0]">
                      <span className="block text-[10px] text-[#5F6368] uppercase font-bold">총 인원</span>
                      <span className="text-xl font-bold">{currentClass.students.length}명</span>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-[#DADCE0]">
                      <span className="block text-[10px] text-[#5F6368] uppercase font-bold">앞자리 그룹</span>
                      <span className="text-xl font-bold">{currentClass.students.filter(s => s.isFrontGroup).length}명</span>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-[#DADCE0]">
                      <span className="block text-[10px] text-[#5F6368] uppercase font-bold">배치 방식</span>
                      <span className="text-xl font-bold">{layoutCols}열</span>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-[#DADCE0]">
                      <span className="block text-[10px] text-[#5F6368] uppercase font-bold">배치 상태</span>
                      <span className={cn(
                        "text-xl font-bold",
                        isFrontGroupRandomized && isOthersRandomized ? "text-green-600" : "text-orange-500"
                      )}>
                        {isFrontGroupRandomized && isOthersRandomized ? "완료" : "진행 중"}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Teacher's View Modal (180 Rotation) */}
        <AnimatePresence>
          {showPrintModal && currentClass && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowPrintModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-[297mm] max-h-[95vh] aspect-[1.414/1] overflow-hidden flex flex-col p-8 relative"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6 no-print">
                  <h3 className="text-xl font-bold text-[#1A73E8]">교탁용 배치도 (180도 회전)</h3>
                  <button 
                    onClick={() => setShowPrintModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <RotateCcw className="w-6 h-6 text-[#5F6368]" />
                  </button>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                  {/* Grid Area (Rotated 180) */}
                  <div 
                    className={cn(
                      "grid gap-2 flex-1 min-h-0",
                      layoutCols === 6 ? "grid-cols-3" : "grid-cols-5"
                    )}
                    style={{
                      gridTemplateRows: layoutCols === 5 
                        ? `repeat(${Math.ceil(seats.length / 5)}, minmax(0, 1fr))` 
                        : '1fr'
                    }}
                  >
                    {/* We render the grid in reverse order for 180 rotation */}
                    {layoutCols === 6 ? (
                      // 6-column sectioned layout (Reversed Sections and Rows)
                      [2, 1, 0].map(sectionIdx => (
                        <div 
                          key={sectionIdx} 
                          className="grid grid-cols-2 gap-2 p-2 bg-gray-50 rounded-xl border border-[#DADCE0] h-full"
                          style={{
                            gridTemplateRows: `repeat(${Math.ceil(seats.length / 6)}, minmax(0, 1fr))`
                          }}
                        >
                          {Array.from({ length: Math.ceil(seats.length / 6) }).reverse().map((_, revRowIdx) => {
                            const rowIdx = Math.ceil(seats.length / 6) - 1 - revRowIdx;
                            return (
                              <React.Fragment key={rowIdx}>
                                {[1, 0].map(colOffset => {
                                  const seatIdx = rowIdx * 6 + sectionIdx * 2 + colOffset;
                                  const seat = seats[seatIdx];
                                  if (!seat) return <div key={colOffset} className="h-full" />;
                                  const student = currentClass.students.find(s => s.id === seat.studentId);
                                  return (
                                    <div
                                      key={seatIdx}
                                      className={cn(
                                        "h-full rounded-lg border flex flex-col items-center justify-center p-1 bg-white",
                                        student ? "border-[#DADCE0]" : "border-dashed border-gray-200 opacity-30"
                                      )}
                                    >
                                      {student && (
                                        <>
                                          <span className="text-sm text-[#5F6368] font-bold mb-0.5">{student.id}번</span>
                                          <span className="text-xl md:text-2xl lg:text-3xl font-bold text-[#202124] truncate w-full text-center px-1">{student.name}</span>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      ))
                    ) : (
                      // 5-column standard layout (Reversed)
                      [...seats].reverse().map((seat, i) => {
                        const student = currentClass.students.find(s => s.id === seat.studentId);
                        return (
                          <div
                            key={seat.index}
                            className={cn(
                              "h-full rounded-lg border flex flex-col items-center justify-center p-1 bg-white",
                              student ? "border-[#DADCE0]" : "border-dashed border-gray-200 opacity-30"
                            )}
                          >
                            {student && (
                              <>
                                <span className="text-sm text-[#5F6368] font-bold mb-0.5">{student.id}번</span>
                                <span className="text-xl md:text-2xl lg:text-3xl font-bold text-[#202124] truncate w-full text-center px-1">{student.name}</span>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Teacher's Area (Now at bottom) */}
                  <div className="mt-4 relative flex justify-center items-start pt-4 border-t border-dashed border-[#DADCE0] shrink-0">
                    <div className="absolute right-0 top-8 border-2 border-[#DADCE0] p-2 rounded text-[10px] font-bold text-[#5F6368] uppercase">
                      앞문
                    </div>
                    <div className="w-64 py-3 bg-[#DADCE0] text-[#5F6368] text-center rounded-lg font-bold text-lg uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm">
                      <Monitor className="w-6 h-6" />
                      교탁 (칠판)
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-4 right-8 text-[10px] text-gray-400 font-medium">
                  {currentClass.className} | A4 Landscape View
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Info */}
        <footer className="mt-8 text-center text-[#5F6368] text-xs">
          <p>© 2026 교실 자리 바꾸기 매니저. 선생님들의 편리한 학급 운영을 응원합니다.</p>
        </footer>
      </div>
    </div>
  );
}
