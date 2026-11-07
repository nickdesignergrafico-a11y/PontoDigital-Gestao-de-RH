import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Wallet, 
  Download, 
  Eye, 
  CheckCircle2, 
  FileText, 
  Printer, 
  ShieldCheck, 
  Trash2, 
  FolderPlus, 
  Folder, 
  FolderOpen, 
  Search, 
  Plus, 
  RefreshCw, 
  ChevronRight, 
  X, 
  Send, 
  FileCheck,
  Building,
  UserCheck,
  ArrowRightLeft,
  ChevronDown,
  Info,
  Sparkles,
  Upload,
  Palmtree,
  RotateCw,
  BookOpen,
  Tag,
  Calculator,
  Settings2,
  Edit3,
  ListPlus,
  Check,
  Clock
} from 'lucide-react';
import { cn, formatCurrency, calcularPontoEValeAutomatico, contarPlantoesTrabalhadosNoMes } from '../../lib/utils';
import { 
  PayrollRubric, 
  SalarySlipLineItem, 
  DEFAULT_PAYROLL_RUBRICS, 
  matchRubricDetails, 
  calculatePayrollTotals, 
  calculateInss, 
  calculateIrrf, 
  PayrollTotals,
  deduplicateSlipItems
} from '../../lib/payrollRubrics';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification } from '../../lib/notifications';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { uploadBase64ToStorage } from '../../lib/storageHelper';

const compressImageForAI = (base64Str: string, maxWidth = 1000, maxHeight = 1000): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }
    
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

interface TaxItem {
  name: string;
  amount: number;
  type: 'deduction' | 'addition';
}

interface DiscountItem {
  name: string;
  amount: number;
}

export default function MySalarySlips() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // State
  const [slips, setSlips] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState<any>(null);
  
  // Navigation & Filters
  const [currentFolderId, setCurrentFolderId] = useState<string>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'salary' | 'vacation'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [selectedAdminEmployee, setSelectedAdminEmployee] = useState<any>(null);
  const [adminSidebarTab, setAdminSidebarTab] = useState<'employees' | 'admins'>('employees');
  const [company, setCompany] = useState<any>(null);
  const [servicePosts, setServicePosts] = useState<any[]>([]);

  // Digital Signature modal states
  const [showSignModal, setShowSignModal] = useState(false);
  const [signMode, setSignMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [signingState, setSigningState] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRotated, setIsRotated] = useState(false);

  // Scale calculations for mobile/APK preview
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [containerRef.current, selectedSlip]);

  useEffect(() => {
    const filter = localStorage.getItem('payroll_doc_filter');
    if (filter === 'vacation' || filter === 'salary') {
      setDocTypeFilter(filter as any);
      localStorage.removeItem('payroll_doc_filter');
    }
  }, []);


  const targetWidth = 794; // Standard A4 width in px for preview
  const isMobileSize = containerWidth < targetWidth;
  const scale = isMobileSize ? (containerWidth - 16) / targetWidth : 1;

  // Rubrics Catalog & Custom Registration (Admin)
  const [customRubrics, setCustomRubrics] = useState<PayrollRubric[]>([]);
  const [showRubricsCatalogModal, setShowRubricsCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [newRubricForm, setNewRubricForm] = useState<PayrollRubric>({
    code: '',
    name: '',
    type: 'addition',
    defaultReference: ''
  });
  const [savingRubric, setSavingRubric] = useState(false);

  // New slip form states (Admin)
  const [showAddSlipModal, setShowAddSlipModal] = useState(false);
  const [slipCreationMode, setSlipCreationMode] = useState<'upload' | 'manual'>('manual');
  const [newSlipForm, setNewSlipForm] = useState({
    userId: '',
    postoName: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    baseSalary: 2500,
    additions: [] as { name: string; amount: number }[],
    deductions: [] as { name: string; amount: number }[],
    documentType: 'salary' as 'salary' | 'vacation',
    vacationStart: '',
    vacationEnd: '',
    acquisitionStart: '',
    acquisitionEnd: '',
    vacationSalary: 2500,
    hasConstitutionalThird: true,
    autoCalculateTaxes: true
  });

  // Structured Rubric Line Items for the current slip
  const [newSlipItems, setNewSlipItems] = useState<SalarySlipLineItem[]>([
    {
      id: 'item-base-init',
      code: '8781',
      description: 'DIAS NORMAIS',
      reference: '31,00',
      type: 'addition',
      amount: 2500
    }
  ]);

  // Input state for adding a rubric row manually
  const [itemInput, setItemInput] = useState({
    code: '',
    description: '',
    reference: '',
    type: 'addition' as 'addition' | 'deduction' | 'info',
    amount: ''
  });
  const [selectedCatalogCode, setSelectedCatalogCode] = useState('');

  const [isParsingAI, setIsParsingAI] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);
  const [tempItem, setTempItem] = useState({ name: '', amount: 0, type: 'addition' });
  const [adminModalTab, setAdminModalTab] = useState<'form' | 'preview'>('form');
  const [slipPlantoes, setSlipPlantoes] = useState<number>(15);
  const [empAttendanceForSlip, setEmpAttendanceForSlip] = useState<any[]>([]);

  // Real-time synchronization of custom rubrics from Firestore
  useEffect(() => {
    if (!isAdmin) return;
    const unsubRubrics = onSnapshot(collection(db, 'payrollRubrics'), (snap) => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRubric));
      setCustomRubrics(loaded);
    }, (err) => {
      console.warn('Could not load custom rubrics from firestore:', err);
    });
    return () => unsubRubrics();
  }, [isAdmin]);

  // Combined Catalog: Standard system rubrics + custom company rubrics
  const allRubrics: PayrollRubric[] = [
    ...DEFAULT_PAYROLL_RUBRICS,
    ...customRubrics.filter(cr => !DEFAULT_PAYROLL_RUBRICS.some(dr => dr.code === cr.code))
  ];

  // Save a new rubric to the catalog in Firestore
  const handleSaveCustomRubric = async () => {
    if (!newRubricForm.code.trim() || !newRubricForm.name.trim()) {
      alert('Por favor informe o Código e a Descrição da rubrica.');
      return;
    }
    setSavingRubric(true);
    try {
      await addDoc(collection(db, 'payrollRubrics'), {
        code: newRubricForm.code.trim().toUpperCase(),
        name: newRubricForm.name.trim().toUpperCase(),
        type: newRubricForm.type,
        defaultReference: newRubricForm.defaultReference?.trim() || '-',
        createdAt: new Date().toISOString()
      });
      setNewRubricForm({ code: '', name: '', type: 'addition', defaultReference: '' });
      alert('Rubrica cadastrada com sucesso no catálogo!');
    } catch (err: any) {
      alert('Erro ao salvar rubrica: ' + (err.message || err));
    } finally {
      setSavingRubric(false);
    }
  };

  // Delete a custom rubric from the catalog
  const handleDeleteCustomRubric = async (id?: string) => {
    if (!id) return;
    if (!confirm('Deseja excluir esta rubrica personalizada do catálogo?')) return;
    try {
      await deleteDoc(doc(db, 'payrollRubrics', id));
    } catch (err: any) {
      alert('Erro ao excluir rubrica: ' + (err.message || err));
    }
  };

  // Select a rubric from dropdown to auto-fill code, description and reference
  const handleSelectCatalogRubric = (val: string) => {
    setSelectedCatalogCode(val);
    if (!val) return;
    let found: any = undefined;
    if (val.includes(':::')) {
      const [c, t] = val.split(':::');
      found = allRubrics.find(r => r.code === c && r.type === t);
    }
    if (!found) {
      found = allRubrics.find(r => r.code === val);
    }
    if (found) {
      setItemInput(prev => ({
        ...prev,
        code: found.code,
        description: found.name,
        type: found.type,
        reference: found.defaultReference || '-'
      }));
    }
  };

  // Add line item to current slip
  const handleAddLineItem = () => {
    const amountNum = Number(itemInput.amount);
    if (!itemInput.description.trim()) {
      alert('Informe a descrição da rubrica.');
      return;
    }
    const isInfoItem = itemInput.type === 'info' || itemInput.code.trim() === '9382' || itemInput.code.trim() === '9392';
    if (!isInfoItem && (isNaN(amountNum) || amountNum <= 0)) {
      alert('Informe um valor válido em R$ maior que zero.');
      return;
    }

    const byCode = itemInput.code.trim() ? allRubrics.find(r => r.code === itemInput.code.trim()) : null;
    const matched = matchRubricDetails(itemInput.description, itemInput.type, allRubrics);
    const codeToUse = itemInput.code.trim() || byCode?.code || matched.code;
    const refToUse = itemInput.reference.trim() || byCode?.defaultReference || matched.reference || '-';
    const typeToUse = isInfoItem ? 'info' : (byCode?.type || itemInput.type);
    const amountToUse = isInfoItem ? 0 : amountNum;

    const newItem: SalarySlipLineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: codeToUse,
      description: itemInput.description.trim().toUpperCase(),
      reference: refToUse,
      type: typeToUse,
      amount: amountToUse
    };

    setNewSlipItems(prev => {
      const codeClean = newItem.code.trim();
      const descClean = newItem.description.trim().toUpperCase();

      // If adding base salary, replace existing base salary item
      if (codeClean === '8781' || descClean.includes('DIAS NORMAIS') || descClean.includes('SALÁRIO BASE')) {
        setNewSlipForm(f => ({ ...f, baseSalary: newItem.amount }));
        const filtered = prev.filter(it => it.code.trim() !== '8781' && !it.description.toUpperCase().includes('DIAS NORMAIS') && !it.description.toUpperCase().includes('SALÁRIO BASE'));
        return [newItem, ...filtered];
      }

      // If item with the same code or description already exists, update it instead of duplicating
      const existingIdx = prev.findIndex(it => (codeClean && it.code.trim() === codeClean) || (it.description.trim().toUpperCase() === descClean && it.type === newItem.type));
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = {
          ...copy[existingIdx],
          ...newItem,
          id: copy[existingIdx].id
        };
        return copy;
      }

      return [...prev, newItem];
    });

    // Clear input
    setItemInput({
      code: '',
      description: '',
      reference: '',
      type: 'addition',
      amount: ''
    });
    setSelectedCatalogCode('');
  };

  // Remove line item
  const handleRemoveLineItem = (index: number) => {
    setNewSlipItems(prev => prev.filter((_, i) => i !== index));
  };

  // Update line item inline
  const handleUpdateLineItem = (index: number, field: keyof SalarySlipLineItem, val: any) => {
    setNewSlipItems(prev => {
      const updated = prev.map((item, i) => {
        if (i !== index) return item;
        return { ...item, [field]: val };
      });
      // Sincroniza salário base automaticamente sempre que qualquer item de salário base ou 8781 for alterado
      const baseItem = updated.find(it => it.code === '8781' || it.description.toUpperCase().includes('DIAS NORMAIS') || it.description.toUpperCase().includes('SALÁRIO BASE'));
      if (baseItem && Number(baseItem.amount) > 0) {
        setNewSlipForm(f => ({ ...f, baseSalary: Number(baseItem.amount) }));
      }
      return updated;
    });
  };

  // Automatically recalculate and inject/update INSS (998) and IRRF (508) in newSlipItems
  const handleAutoRecalculateTaxes = () => {
    const totals = calculatePayrollTotals(newSlipItems, newSlipForm.baseSalary);
    setNewSlipItems(prev => {
      let updated = prev.filter(it => it.code !== '998' && it.code !== '508' && !it.description.includes('INSS') && !it.description.includes('IRRF'));
      if (totals.inssValorCalculado > 0) {
        updated.push({
          id: `item-inss-${Date.now()}`,
          code: '998',
          description: 'INSS - PREVIDÊNCIA SOCIAL (CLT)',
          reference: calculateInss(totals.salContrInss).effectiveRate,
          type: 'deduction',
          amount: totals.inssValorCalculado
        });
      }
      if (totals.irrfValorCalculado > 0) {
        updated.push({
          id: `item-irrf-${Date.now()}`,
          code: '508',
          description: 'IRRF - IMPOSTO DE RENDA RETIDO NA FONTE',
          reference: totals.faixaIrrf,
          type: 'deduction',
          amount: totals.irrfValorCalculado
        });
      }
      return updated;
    });
  };

  useEffect(() => {
    if (!isAdmin || !selectedAdminEmployee?.id) {
      setEmpAttendanceForSlip([]);
      return;
    }
    const qAtt = query(collection(db, 'attendance'), where('userId', '==', selectedAdminEmployee.id));
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      setEmpAttendanceForSlip(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubAtt();
  }, [isAdmin, selectedAdminEmployee]);

  // Sync employee salary to base salary item when employee changes
  useEffect(() => {
    if (selectedAdminEmployee) {
      const empSalary = Number(selectedAdminEmployee.salary) || 2500;
      setNewSlipForm(prev => ({
        ...prev,
        userId: selectedAdminEmployee.id,
        baseSalary: empSalary
      }));
      setNewSlipItems(prev => {
        const hasBase = prev.some(it => it.code === '8781' || it.description.toUpperCase().includes('DIAS NORMAIS') || it.description.toUpperCase().includes('SALÁRIO BASE'));
        if (hasBase) {
          return prev.map(it => {
            if (it.code === '8781' || it.description.toUpperCase().includes('DIAS NORMAIS') || it.description.toUpperCase().includes('SALÁRIO BASE')) {
              return { ...it, amount: empSalary };
            }
            return it;
          });
        }
        return [
          {
            id: `item-base-${Date.now()}`,
            code: '8781',
            description: 'DIAS NORMAIS',
            reference: '31,00',
            type: 'addition',
            amount: empSalary
          },
          ...prev
        ];
      });
    }
  }, [selectedAdminEmployee]);

  const detectedSlipShifts = contarPlantoesTrabalhadosNoMes(
    empAttendanceForSlip,
    selectedAdminEmployee?.id || '',
    newSlipForm.month,
    newSlipForm.year
  );

  const applyValeDiscountToSlip = (plantoesCount: number) => {
    const validShifts = Math.max(0, Math.floor(Number(plantoesCount) || 0));
    setSlipPlantoes(validShifts);
    const label = `VALE ALIMENTAÇÃO`;
    const refText = validShifts > 0 ? `${validShifts},00` : '15,00';

    // 9382 fica exclusivamente em referência (tipo 'info', amount: 0, sem vencimento e sem desconto)
    setNewSlipItems(prev => {
      const filtered = prev.filter(
        it => it.code !== '9382' && it.code !== '9392' && !it.description.toUpperCase().includes('VALE REFEI') && !it.description.toUpperCase().includes('VALE ALIMENTA')
      );
      return [
        ...filtered,
        {
          id: `item-vr-ref-${Date.now()}`,
          code: '9382',
          description: label,
          reference: refText,
          type: 'info',
          amount: 0
        }
      ];
    });

    setNewSlipForm(prev => {
      const filteredDeductions = (prev.deductions || []).filter(
        (d: any) => !d.name.toUpperCase().includes('VALE REFEI') && !d.name.toUpperCase().includes('VALE ALIMENTA') && d.code !== '9382'
      );
      return {
        ...prev,
        deductions: filteredDeductions
      };
    });
  };

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // Fetch company config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "company", "config"), (snapshot) => {
      if (snapshot.exists()) {
        setCompany(snapshot.data());
      }
    });
    return unsub;
  }, []);

  // Prevent default drag & drop behaviors across the whole window to stop loading/opening files
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, []);

  // Fetch employees for admin view in real time
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'users'));
    const unsubEmployees = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
        .filter((u: any) => u.active !== false);
      setEmployees(list);
      // If none selected yet, select the first active collaborator
      setSelectedAdminEmployee(current => {
        if (current) {
          const stillExists = list.find((u: any) => u.id === current.id);
          if (stillExists) return stillExists;
        }
        return list.find((u: any) => u.role !== 'admin') || (list.length > 0 ? list[0] : null);
      });
    }, (error) => {
      console.error('Error fetching employees in real-time:', error);
    });

    return unsubEmployees;
  }, [isAdmin]);

  // Fetch service posts in real time
  useEffect(() => {
    const qPosts = query(collection(db, 'servicePosts'));
    const unsubPosts = onSnapshot(qPosts, (snapshot) => {
      const pList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setServicePosts(pList);
    }, (error) => {
      console.warn('Erro ao buscar postos de serviço:', error);
    });

    return () => unsubPosts();
  }, []);

  // Helper para identificar automaticamente o posto de serviço do colaborador
  const findEmployeeServicePost = (emp: any): string => {
    if (!emp) return 'MAESTRO LOCADORA DE';
    // 1. Posto cadastrado diretamente no perfil do colaborador
    if (emp.postoName && emp.postoName.trim()) {
      return emp.postoName.trim();
    }
    // 2. Busca nos postos de serviço cadastrados onde o colaborador está alocado
    const empName = (emp.name || '').trim().toLowerCase();
    const empId = emp.id || emp.uid;
    const found = servicePosts.find((p: any) => {
      const cols = Array.isArray(p.colaboradores) ? p.colaboradores : [];
      const vigs = Array.isArray(p.vigilantes) ? p.vigilantes : [];
      return cols.some((c: string) => (typeof c === 'string' && c.toLowerCase().includes(empName)) || c === empId) ||
             vigs.some((v: string) => (typeof v === 'string' && v.toLowerCase().includes(empName)) || v === empId);
    });
    if (found && found.name) {
      return found.name.trim();
    }
    return 'MAESTRO LOCADORA DE';
  };

  // Sincroniza posto do colaborador automaticamente na criação do holerite
  useEffect(() => {
    if (selectedAdminEmployee) {
      const autoPost = findEmployeeServicePost(selectedAdminEmployee);
      setNewSlipForm(prev => ({
        ...prev,
        userId: selectedAdminEmployee.id,
        postoName: autoPost
      }));
    }
  }, [selectedAdminEmployee, servicePosts]);

  // Fetch data depending on role in real time
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    let unsubSlips = () => {};
    let unsubFolders = () => {};

    if (isAdmin) {
      if (selectedAdminEmployee) {
        const q = query(
          collection(db, 'salarySlips'), 
          where('userId', '==', selectedAdminEmployee.id)
        );
        unsubSlips = onSnapshot(q, (snapshot) => {
          const adminSlips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
          adminSlips.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return b.month - a.month;
          });
          setSlips(adminSlips);
          
          setSelectedSlip(currentSelected => {
            if (!currentSelected) {
              return adminSlips.length > 0 ? adminSlips[0] : null;
            }
            const updated = adminSlips.find(s => s.id === currentSelected.id);
            return updated || (adminSlips.length > 0 ? adminSlips[0] : null);
          });
          setLoading(false);
        }, (error) => {
          console.error("Firestore real-time slips error (Admin):", error);
          setLoading(false);
        });
      } else {
        setSlips([]);
        setSelectedSlip(null);
        setLoading(false);
      }
    } else {
      // Load employee slips in real time
      const q = query(
        collection(db, 'salarySlips'), 
        where('userId', '==', user.uid)
      );
      unsubSlips = onSnapshot(q, (snapshot) => {
        const employeeSlips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        employeeSlips.sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return b.month - a.month;
        });
        setSlips(employeeSlips);

        setSelectedSlip(currentSelected => {
          if (!currentSelected) {
            const firstUnsigned = employeeSlips.find((s: any) => !s.signed);
            return firstUnsigned || (employeeSlips.length > 0 ? employeeSlips[0] : null);
          }
          const updated = employeeSlips.find(s => s.id === currentSelected.id);
          return updated || (employeeSlips.length > 0 ? employeeSlips[0] : null);
        });
        setLoading(false);
      }, (error) => {
        console.error("Firestore real-time slips error (Employee):", error);
        setLoading(false);
      });

      // Load employee folders in real time
      const fq = query(
        collection(db, 'salarySlipFolders'),
        where('userId', '==', user.uid)
      );
      unsubFolders = onSnapshot(fq, (fSnapshot) => {
        const employeeFolders = fSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        employeeFolders.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        setFolders(employeeFolders);
      }, (error) => {
        console.error("Firestore real-time folders error:", error);
      });
    }

    return () => {
      unsubSlips();
      unsubFolders();
    };
  }, [user, selectedAdminEmployee, isAdmin]);

  // Keep a small helper function compatibility or noop
  const fetchData = async () => {
    // Slips and folders are handled by real-time onSnapshot listeners
  };

  // Folder Operations
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    try {
      const folderData = {
        name: newFolderName.trim(),
        userId: user.uid,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'salarySlipFolders'), folderData);
      setFolders([{ id: docRef.id, ...folderData }, ...folders]);
      setNewFolderName('');
      setShowFolderInput(false);
    } catch (err) {
      alert('Erro ao criar pasta: ' + err);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Deseja excluir esta pasta? Seus holerites continuarão salvos no aplicativo.')) return;
    try {
      await deleteDoc(doc(db, 'salarySlipFolders', folderId));
      setFolders(folders.filter(f => f.id !== folderId));
      
      // Remove folderId from related slips in database and local state
      const slipsInFolder = slips.filter(s => s.folderId === folderId);
      for (const s of slipsInFolder) {
        await updateDoc(doc(db, 'salarySlips', s.id), { folderId: null });
      }
      setSlips(slips.map(s => s.folderId === folderId ? { ...s, folderId: null } : s));
      
      if (currentFolderId === folderId) {
        setCurrentFolderId('all');
      }
    } catch (err) {
      alert('Erro ao excluir pasta.');
    }
  };

  const handleMoveToFolder = async (slipId: string, destFolderId: string | null) => {
    try {
      await updateDoc(doc(db, 'salarySlips', slipId), {
        folderId: destFolderId
      });
      setSlips(slips.map(s => s.id === slipId ? { ...s, folderId: destFolderId } : s));
      if (selectedSlip?.id === slipId) {
        setSelectedSlip({ ...selectedSlip, folderId: destFolderId });
      }
    } catch (err) {
      alert('Erro ao guardar na pasta.');
    }
  };

  // Canvas Drawing Handlers (Transparent Signature)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setIsDrawing(true);
    const pos = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(pos.x - 1, pos.y - 1, 2, 2);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCoordinates(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e3a8a'; 
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const getCoordinates = (e: any, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    if (isRotated) {
      const rx = clientX - rect.left;
      const ry = clientY - rect.top;
      return {
        x: (ry / rect.height) * canvas.width,
        y: canvas.height - (rx / rect.width) * canvas.height
      };
    }
    
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Handle Employee Signature Submission
  const handleSignatureSubmit = async () => {
    if (!selectedSlip) return;
    setSigningState(true);
    try {
      let dataUrl = '';
      if (signMode === 'draw' && canvasRef.current) {
        dataUrl = canvasRef.current.toDataURL('image/png');
      } else if (signMode === 'type' && typedName.trim()) {
        // Render typed calligraphic name on transparent canvas
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#1e3a8a'; // Blue ink
          ctx.font = 'italic bold 44px "Caveat", "Dancing Script", "Brush Script MT", cursive';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(-0.035); 
          ctx.fillText(typedName.trim(), 0, 0);
          dataUrl = canvas.toDataURL('image/png');
        }
      }

      if (!dataUrl) {
        alert('Assinatura vazia. Por favor desenhe ou digite para validar.');
        setSigningState(false);
        return;
      }

      const slipId = selectedSlip.id;
      // Upload signature canvas image to Firebase Storage to avoid large inline base64 string in Firestore
      const uploadPath = `signatures/slips/${user?.uid || 'anonymous'}_${slipId}_${Date.now()}.png`;
      const downloadURL = await uploadBase64ToStorage(dataUrl, uploadPath);

      const dummyIp = '177.' + Math.floor(Math.random() * 200 + 40) + '.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250);

      const signedAtIso = new Date().toISOString();
      const payload = {
        signed: true,
        signatureDataUrl: downloadURL,
        signatureText: signMode === 'type' ? typedName.trim() : '',
        signatureType: signMode,
        signedAt: signedAtIso,
        signerIp: dummyIp,
        signerUserAgent: navigator.userAgent || 'App-Movel-Webview',
        sentToCompany: true,
        sentToCompanyAt: signedAtIso,
        returnedToCompany: true,
        returnedToCompanyAt: signedAtIso,
        employeeCopySaved: true,
        employeeCopySavedAt: signedAtIso,
        hasEmployeeCopy: true,
        companyCopySaved: true
      };

      await updateDoc(doc(db, 'salarySlips', slipId), payload);

      // Local State Update
      const updatedSlip = { ...selectedSlip, ...payload };
      setSlips(slips.map(s => s.id === slipId ? updatedSlip : s));
      setSelectedSlip(updatedSlip);

      // Notification for employee confirming copy is now saved in app
      if (user?.uid) {
        await createNotification(
          user.uid,
          'Holerite Assinado e Salvo no App',
          `Seu Holerite de ${months[selectedSlip.month - 1]}/${selectedSlip.year} foi assinado e devolvido para a empresa com sucesso! Uma cópia oficial com sua assinatura já está salva e arquivada no seu aplicativo.`,
          'success',
          'payroll'
        );
      }

      setShowSignModal(false);
      alert('Holerite assinado digitalmente e devolvido com sucesso! A sua via oficial assinada já está salva e arquivada no seu aplicativo.');
    } catch (err) {
      alert('Erro ao assinar holerite: ' + err);
    } finally {
      setSigningState(false);
    }
  };

  // Admin: Auto calculate INSS and IRPF deductions
  const autoCalculateDeductions = (salary: number) => {
    // INSS standard model
    let inss = 0;
    if (salary <= 1412) inss = salary * 0.075;
    else if (salary <= 2666.68) inss = (salary * 0.09) - 21.18;
    else if (salary <= 4000.03) inss = (salary * 0.12) - 101.18;
    else inss = (salary * 0.14) - 181.18;

    // IRPF standard simplified model
    let irpf = 0;
    const baseCalculo = salary - inss;
    if (baseCalculo <= 2259.20) irpf = 0;
    else if (baseCalculo <= 2826.65) irpf = (baseCalculo * 0.075) - 169.44;
    else if (baseCalculo <= 3751.05) irpf = (baseCalculo * 0.15) - 381.44;
    else if (baseCalculo <= 4664.68) irpf = (baseCalculo * 0.225) - 662.77;
    else irpf = (baseCalculo * 0.275) - 896.00;

    return {
      inss: Number(Math.max(0, inss).toFixed(2)),
      irpf: Number(Math.max(0, irpf).toFixed(2))
    };
  };

  const getCboByJob = (job?: string) => {
    const normalized = (job || '').toUpperCase();
    if (normalized.includes('VIGIA') || normalized.includes('VIGILANTE')) return '517420';
    if (normalized.includes('ADMIN') || normalized.includes('AUXILIAR')) return '411010';
    if (normalized.includes('RECEPCIONISTA')) return '422105';
    if (normalized.includes('MOTORISTA')) return '782320';
    if (normalized.includes('SERVIÇOS') || normalized.includes('LIMPEZA') || normalized.includes('AUXILIAR DE SERVICOS') || normalized.includes('AUXILIAR DE SERVIÇOS')) return '514320';
    if (normalized.includes('GERENTE') || normalized.includes('DIRETOR')) return '142105';
    return '517420'; // Standard vigia fallback
  };

  const getRubricCode = (name: string, fallbackCode: string = '100') => {
    const norm = (name || '').toUpperCase();
    if (norm.includes('BASE') || norm.includes('CONTRATUAL') || norm.includes('DIAS NORMAIS') || norm === 'SALÁRIO BASE') return '8781';
    if (norm.includes('REFLEXO') || norm.includes('DSR')) return '8125';
    if (norm.includes('EXTRA') || norm.includes('HORAS EXTRAS')) return '150';
    if (norm.includes('VALE ALIMENTAÇÃO') || norm.includes('VALE ALIMENTACAO') || norm.includes('VALE REFEIÇÃO') || norm.includes('VALE REFEICAO') || norm.includes('9382') || norm.includes('9392')) {
      return '9382';
    }
    if (norm.includes('SEGURO') || norm.includes('VIDA')) return '203';
    if (norm.includes('INSS') || norm === 'I.N.S.S.') return '998';
    if (norm.includes('IRPF') || norm.includes('IMPOSTO DE RENDA') || norm.includes('SIMPLIFICADO')) return '508';
    return fallbackCode;
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getPreviewCalc = () => {
    const isVacation = newSlipForm.documentType === 'vacation';
    
    if (isVacation) {
      const vacationSalary = Number(newSlipForm.vacationSalary || newSlipForm.baseSalary || 2500);
      const constThird = newSlipForm.hasConstitutionalThird ? Number((vacationSalary / 3).toFixed(2)) : 0;
      const extraAdditions = newSlipItems.filter(it => it.type === 'addition' && it.code !== '0220' && it.code !== '0221');
      const extraAdditionsSum = extraAdditions.reduce((acc, cur) => acc + cur.amount, 0);
      const totalAdditions = vacationSalary + constThird + extraAdditionsSum;
      
      const inss = Number(calculateInss(totalAdditions).inss.toFixed(2));
      const irpf = Number(calculateIrrf(Math.max(0, totalAdditions - inss)).irrf.toFixed(2));

      const taxes: any[] = [
        { name: 'INSS s/ Férias', amount: inss, type: 'deduction', code: '0910', reference: calculateInss(totalAdditions).effectiveRate },
        ...(irpf > 0 ? [{ name: 'IRPF s/ Férias', amount: irpf, type: 'deduction', code: '0514', reference: calculateIrrf(Math.max(0, totalAdditions - inss)).faixa }] : [])
      ];
      extraAdditions.forEach(a => taxes.push({ name: a.description, amount: a.amount, type: 'addition', code: a.code, reference: a.reference }));

      const discounts = newSlipItems.filter(it => it.type === 'deduction' && it.code !== '0910' && it.code !== '0514');
      discounts.forEach(d => taxes.push({ name: d.description, amount: d.amount, type: 'deduction', code: d.code, reference: d.reference }));

      const totalDeductions = inss + (irpf > 0 ? irpf : 0) + discounts.reduce((acc, cur) => acc + cur.amount, 0);
      const netSalary = Math.max(0, totalAdditions - totalDeductions);

      return {
        baseSalary: vacationSalary,
        vacationSalary,
        constThird,
        taxes,
        discounts: discounts.map(d => ({ name: d.description, amount: d.amount })),
        totalAdditions,
        totalDeductions,
        netSalary,
        isVacation: true,
        vacationStart: newSlipForm.vacationStart,
        vacationEnd: newSlipForm.vacationEnd,
        acquisitionStart: newSlipForm.acquisitionStart,
        acquisitionEnd: newSlipForm.acquisitionEnd,
        hasConstitutionalThird: newSlipForm.hasConstitutionalThird,
        salContrInss: totalAdditions,
        baseFgts: totalAdditions,
        fgtsMes: Number((totalAdditions * 0.08).toFixed(2)),
        baseIrrf: Math.max(0, totalAdditions - inss),
        faixaIrrf: calculateIrrf(Math.max(0, totalAdditions - inss)).faixa,
        items: newSlipItems
      };
    } else {
      const totals = calculatePayrollTotals(newSlipItems, newSlipForm.baseSalary);
      return {
        ...totals,
        taxes: newSlipItems.map(it => ({
          name: it.description,
          amount: it.amount,
          type: it.type,
          code: it.code,
          reference: it.reference
        })),
        discounts: newSlipItems.filter(it => it.type === 'deduction').map(it => ({
          name: it.description,
          amount: it.amount,
          code: it.code,
          reference: it.reference
        })),
        isVacation: false,
        items: newSlipItems
      };
    }
  };

  const previewCalc = getPreviewCalc();

  const handleAIFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFileWithAI(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFileWithAI(file);
    }
  };

  const processFileWithAI = async (file: File) => {
    setIsParsingAI(true);
    setAiError(null);
    setAiSuccessMessage(null);

    try {
      const reader = new FileReader();
      const filePromise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsDataURL(file);
      const rawBase64 = await filePromise;
      const base64Data = await compressImageForAI(rawBase64, 1000, 1000);

      const response = await fetch("/api/parse-holerite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileB64: base64Data,
          mimeType: base64Data.startsWith("data:") ? (base64Data.split(";")[0].split(":")[1] || file.type) : file.type
        })
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const textResponse = await response.text();
        console.error("Non-JSON Response received from holerite AI service:", textResponse);

        let customError = "Resposta inválida do servidor backend (não é JSON).";
        if (response.status === 404) {
          customError = "O serviço de processamento inteligente de holerites (/api/parse-holerite) não está disponível (404). Verifique se o servidor backend está ativo.";
        } else if (response.status === 413 || textResponse.includes("Payload Too Large")) {
          customError = "O arquivo enviado é grande demais para ser processado (413 Payload Too Large). Experimente enviar uma foto menor ou comprimida.";
        } else if (textResponse.includes("<!DOCTYPE") || textResponse.includes("<html")) {
          const matchedTitle = textResponse.match(/<title>([\s\S]*?)<\/title>/i);
          const pageTitle = matchedTitle ? matchedTitle[1].trim() : "";
          customError = `O servidor retornou uma página HTML (${response.status}${pageTitle ? ': ' + pageTitle : ''}) em vez de dados JSON. Certifique-se de configurar a chave GEMINI_API_KEY no painel Settings > Secrets do AI Studio.`;
        } else {
          customError = `Erro ${response.status} do servidor: ${textResponse.slice(0, 150)}`;
        }
        throw new Error(customError);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Erro desconhecido ao processar holerite.");
      }

      const { data, matchedEmployee } = result;

      // Locate employee in our local list first to ensure reactivity
      let targetUserId = newSlipForm.userId;
      if (matchedEmployee) {
        const found = employees.find(e => e.id === matchedEmployee.id);
        if (found) {
          setSelectedAdminEmployee(found);
          targetUserId = found.id;
          setAiSuccessMessage(`IA identificou o colaborador: ${found.name}!`);
        } else {
          setAiSuccessMessage(`IA detectou o colaborador de nome "${matchedEmployee.name}" e CPF no holerite, mas ele não foi localizado na lista de funcionários ativos do painel.`);
        }
      } else {
        setAiSuccessMessage(`Dados extraídos com sucesso! Por favor, selecione o colaborador correspondente.`);
      }

      // Populate structured newSlipItems with extracted items
      const parsedItems: SalarySlipLineItem[] = [];
      const baseSalaryDetected = Number(data.baseSalary) || newSlipForm.baseSalary || 2500;
      
      const hasBaseInAdditions = (data.additions || []).some((a: any) => {
        const c = String(a.code || '').trim();
        const desc = (a.name || a.description || '').toUpperCase();
        return c === '8781' || desc.includes('DIAS NORMAIS') || desc.includes('SALÁRIO BASE') || desc.includes('SALARIO BASE');
      });

      if (!hasBaseInAdditions) {
        parsedItems.push({
          id: `item-ai-base-${Date.now()}`,
          code: '8781',
          description: 'DIAS NORMAIS',
          reference: '31,00',
          type: 'addition',
          amount: baseSalaryDetected
        });
      }

      (data.additions || []).forEach((a: any, idx: number) => {
        const matched = matchRubricDetails(a.name || a.description, 'addition', allRubrics);
        const code = a.code || matched.code;
        const desc = (a.name || a.description || matched.description).toUpperCase();
        const isBase = code === '8781' || desc.includes('DIAS NORMAIS') || desc.includes('SALÁRIO BASE') || desc.includes('SALARIO BASE');
        parsedItems.push({
          id: `item-ai-add-${idx}-${Date.now()}`,
          code: isBase ? '8781' : code,
          description: isBase ? 'DIAS NORMAIS' : desc,
          reference: isBase ? (a.reference || '31,00') : (a.reference || matched.reference),
          type: 'addition',
          amount: Number(a.amount) || (isBase ? baseSalaryDetected : 0)
        });
      });

      (data.deductions || []).forEach((d: any, idx: number) => {
        const matched = matchRubricDetails(d.name || d.description, 'deduction', allRubrics);
        parsedItems.push({
          id: `item-ai-ded-${idx}-${Date.now()}`,
          code: d.code || matched.code,
          description: (d.name || d.description || matched.description).toUpperCase(),
          reference: d.reference || matched.reference,
          type: 'deduction',
          amount: Number(d.amount) || 0
        });
      });

      const cleanParsed = deduplicateSlipItems(parsedItems);
      setNewSlipItems(cleanParsed);
      setSlipCreationMode('upload');

      setNewSlipForm(prev => ({
        ...prev,
        userId: targetUserId,
        month: data.month || prev.month,
        year: data.year || prev.year,
        baseSalary: baseSalaryDetected,
        additions: (data.additions || []).map((a: any) => ({ name: a.name, amount: Number(a.amount) })),
        deductions: (data.deductions || []).map((d: any) => ({ name: d.name, amount: Number(d.amount) })),
        autoCalculateTaxes: false
      }));

    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Erro desconhecido ao processar holerite com IA.");
    } finally {
      setIsParsingAI(false);
    }
  };

  const handleAddSlipItem = () => {
    if (!tempItem.name || tempItem.amount <= 0) return;
    const matched = matchRubricDetails(tempItem.name, tempItem.type as any, allRubrics);
    setNewSlipItems(prev => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        code: matched.code,
        description: tempItem.name.trim().toUpperCase(),
        reference: matched.reference,
        type: tempItem.type as 'addition' | 'deduction',
        amount: tempItem.amount
      }
    ]);
    setTempItem({ name: '', amount: 0, type: tempItem.type });
  };

  const handleRemoveAddition = (index: number) => {
    setNewSlipForm({
      ...newSlipForm,
      additions: newSlipForm.additions.filter((_, i) => i !== index)
    });
  };

  const handleRemoveDeduction = (index: number) => {
    setNewSlipForm({
      ...newSlipForm,
      deductions: newSlipForm.deductions.filter((_, i) => i !== index)
    });
  };

  // Admin submit new slip
  const handleCreateSlipSubmit = async () => {
    if (!selectedAdminEmployee) {
      alert('Nenhum colaborador selecionado.');
      return;
    }

    try {
      const isVacation = newSlipForm.documentType === 'vacation';
      const assignedPosto = (
        newSlipForm.postoName || 
        findEmployeeServicePost(selectedAdminEmployee) || 
        selectedAdminEmployee.postoName || 
        'MAESTRO LOCADORA DE'
      ).trim();

      let slipData: any = {};

      if (isVacation) {
        const vacationSalary = Number(newSlipForm.vacationSalary || newSlipForm.baseSalary || 2500);
        const constThird = newSlipForm.hasConstitutionalThird ? Number((vacationSalary / 3).toFixed(2)) : 0;
        const extraAdditions = newSlipItems.filter(it => it.type === 'addition' && it.code !== '0220' && it.code !== '0221');
        const totalAdditions = vacationSalary + constThird + extraAdditions.reduce((acc, cur) => acc + cur.amount, 0);

        const inss = Number(calculateInss(totalAdditions).inss.toFixed(2));
        const irpf = Number(calculateIrrf(Math.max(0, totalAdditions - inss)).irrf.toFixed(2));

        const rawVacationItems: SalarySlipLineItem[] = [
          { id: 'vac-1', code: '0220', description: 'VALOR DAS FÉRIAS (GOZO)', reference: '30 Dias', type: 'addition', amount: vacationSalary },
          ...(newSlipForm.hasConstitutionalThird ? [{ id: 'vac-2', code: '0221', description: 'TERÇO CONSTITUCIONAL DE FÉRIAS (1/3)', reference: '33,33%', type: 'addition' as const, amount: constThird }] : []),
          ...extraAdditions,
          { id: 'vac-inss', code: '0910', description: 'INSS S/ FÉRIAS', reference: calculateInss(totalAdditions).effectiveRate, type: 'deduction' as const, amount: inss },
          ...(irpf > 0 ? [{ id: 'vac-irpf', code: '0514', description: 'IRPF S/ FÉRIAS', reference: calculateIrrf(Math.max(0, totalAdditions - inss)).faixa, type: 'deduction' as const, amount: irpf }] : []),
          ...newSlipItems.filter(it => it.type === 'deduction' && it.code !== '0910' && it.code !== '0514')
        ];

        const vacationItems = deduplicateSlipItems(rawVacationItems);
        const totalDeductions = vacationItems.filter(it => it.type === 'deduction').reduce((acc, cur) => acc + cur.amount, 0);
        const netSalary = Math.max(0, totalAdditions - totalDeductions);

        slipData = {
          userId: selectedAdminEmployee.id,
          month: Number(newSlipForm.month),
          year: Number(newSlipForm.year),
          baseSalary: vacationSalary,
          totalAdditions: Number(totalAdditions.toFixed(2)),
          totalDeductions: Number(totalDeductions.toFixed(2)),
          netSalary: Number(netSalary.toFixed(2)),
          salContrInss: Number(totalAdditions.toFixed(2)),
          baseFgts: Number(totalAdditions.toFixed(2)),
          fgtsMes: Number((totalAdditions * 0.08).toFixed(2)),
          baseIrrf: Number(Math.max(0, totalAdditions - inss).toFixed(2)),
          faixaIrrf: calculateIrrf(Math.max(0, totalAdditions - inss)).faixa,
          items: vacationItems,
          taxes: vacationItems.map(it => ({
            name: it.description,
            amount: it.amount,
            type: it.type,
            code: it.code,
            reference: it.reference
          })),
          discounts: vacationItems.filter(it => it.type === 'deduction').map(it => ({
            name: it.description,
            amount: it.amount,
            code: it.code,
            reference: it.reference
          })),
          signed: false,
          issuedAt: new Date().toISOString(),
          documentType: 'vacation',
          postoName: assignedPosto,
          centroCusto: assignedPosto,
          vacationStart: newSlipForm.vacationStart || '',
          vacationEnd: newSlipForm.vacationEnd || '',
          acquisitionStart: newSlipForm.acquisitionStart || '',
          acquisitionEnd: newSlipForm.acquisitionEnd || '',
          vacationSalary: vacationSalary,
          hasConstitutionalThird: newSlipForm.hasConstitutionalThird
        };
      } else {
        const cleanItems = deduplicateSlipItems(newSlipItems);
        const totals = calculatePayrollTotals(cleanItems, newSlipForm.baseSalary);

        slipData = {
          userId: selectedAdminEmployee.id,
          month: Number(newSlipForm.month),
          year: Number(newSlipForm.year),
          baseSalary: totals.baseSalary,
          totalAdditions: totals.totalAdditions,
          totalDeductions: totals.totalDeductions,
          netSalary: totals.netSalary,
          salContrInss: totals.salContrInss,
          baseFgts: totals.baseFgts,
          fgtsMes: totals.fgtsMes,
          baseIrrf: totals.baseIrrf,
          faixaIrrf: totals.faixaIrrf,
          items: cleanItems,
          taxes: cleanItems.map(it => ({
            name: it.description,
            amount: it.amount,
            type: it.type,
            code: it.code,
            reference: it.reference
          })),
          discounts: cleanItems.filter(it => it.type === 'deduction' && it.code !== '9382' && it.code !== '9392').map(it => ({
            name: it.description,
            amount: it.amount,
            code: it.code,
            reference: it.reference
          })),
          signed: false,
          issuedAt: new Date().toISOString(),
          sentToCompanyAt: new Date().toISOString(),
          sentToEmployeeAt: new Date().toISOString(),
          companyCopySaved: true,
          employeeCopySaved: false,
          hasEmployeeCopy: false,
          documentType: 'salary',
          postoName: assignedPosto,
          centroCusto: assignedPosto
        };
      }

      await addDoc(collection(db, 'salarySlips'), slipData);

      // Create notification for employee requesting signature
      const notificationTitle = isVacation ? 'Férias Enviadas pela Administração' : 'Novo Holerite Enviado';
      const notificationMsg = isVacation
        ? `A Administração enviou seu Recibo de Férias (${newSlipForm.vacationStart} a ${newSlipForm.vacationEnd}). Acesse seu aplicativo para assinar e devolver. A via oficial ficará salva após a assinatura.`
        : `A Administração enviou o seu holerite do mês de ${months[slipData.month - 1]}/${slipData.year}. Acesse o aplicativo para assinar e devolver. Sua via oficial ficará salva para você após a assinatura.`;

      await createNotification(
        selectedAdminEmployee.id,
        notificationTitle,
        notificationMsg,
        'info',
        'payroll'
      );

      alert(isVacation 
        ? 'Documentações de Férias enviadas ao colaborador com sucesso! Assim que ele assinar e devolver pelo aplicativo, a via oficial será arquivada e salva no app dele.' 
        : 'Holerite despachado ao colaborador com sucesso! Assim que o colaborador assinar e devolver pelo aplicativo, a via oficial será arquivada e salva para ele no aplicativo.');
      setShowAddSlipModal(false);
      fetchData(); // Refresh list
    } catch (err) {
      alert('Erro ao criar faturamento de documento: ' + err);
    }
  };

  const handleDeleteSlip = async (slipId: string) => {
    if (!confirm('Tem certeza de que deseja excluir permanentemente este holerite?')) return;
    try {
      await deleteDoc(doc(db, 'salarySlips', slipId));
      setSlips(slips.filter(s => s.id !== slipId));
      if (selectedSlip?.id === slipId) {
        setSelectedSlip(null);
      }
      alert('Holerite removido com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir holerite:', err);
      const errMsg = err?.message || String(err);
      alert('Erro ao excluir holerite: ' + errMsg);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter slips for UI display
  const filteredSlips = slips.filter(slip => {
    let matchesFolder = true;
    if (!isAdmin) {
      if (currentFolderId === 'unsigned') matchesFolder = !slip.signed;
      else if (currentFolderId === 'signed') matchesFolder = slip.signed;
      else if (currentFolderId !== 'all') matchesFolder = slip.folderId === currentFolderId;
    }

    const matchesDocType = 
      docTypeFilter === 'all' ||
      (docTypeFilter === 'salary' && slip.documentType !== 'vacation') ||
      (docTypeFilter === 'vacation' && slip.documentType === 'vacation');

    const matchesSearch = 
      months[slip.month - 1].toLowerCase().includes(searchTerm.toLowerCase()) ||
      slip.year.toString().includes(searchTerm);

    return matchesFolder && matchesDocType && matchesSearch;
  });

  const slipUser = employees.find(e => e.id === selectedSlip?.userId) || (isAdmin ? selectedAdminEmployee : user);
  const targetEmployeeName = slipUser?.name || (isAdmin ? (selectedAdminEmployee?.name || 'FUNCIONÁRIO') : (user?.name || 'CONTRATADO'));
  const targetEmployeeCpf = slipUser?.cpf || (isAdmin ? (selectedAdminEmployee?.cpf || '') : (user?.cpf || ''));
  const targetEmployeeId = slipUser?.employeeId || (isAdmin ? (selectedAdminEmployee?.employeeId || '') : (user?.employeeId || ''));
  const targetEmployeeJob = slipUser?.department || (isAdmin ? (selectedAdminEmployee?.department || '') : (user?.department || ''));
  const targetEmployeePosto = selectedSlip?.postoName || selectedSlip?.centroCusto || slipUser?.postoName || findEmployeeServicePost(slipUser) || 'MAESTRO LOCADORA DE';

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-8 h-8 text-blue-600" />
            {isAdmin ? 'Controle Financeiro & Holerites (Administração)' : 'Holerites e Assinaturas'}
          </h1>
          <p className="text-slate-500">
            {isAdmin 
              ? 'Administre e despache recibos de salários assinados eletronicamente sob a CLT.' 
              : 'Verifique holerites despachados pela Administração, assine eletronicamente e organize suas pastas.'}
          </p>
        </div>
        
        {isAdmin && (
          <button 
            onClick={() => {
              const curMonth = new Date().getMonth() + 1;
              const curYear = new Date().getFullYear();
              const autoShifts = contarPlantoesTrabalhadosNoMes(empAttendanceForSlip, selectedAdminEmployee?.id || '', curMonth, curYear) || 15;
              const vrCalc = calcularPontoEValeAutomatico(autoShifts);
              setSlipPlantoes(autoShifts);
              setNewSlipForm({
                userId: selectedAdminEmployee?.id || '',
                postoName: findEmployeeServicePost(selectedAdminEmployee) || selectedAdminEmployee?.postoName || 'MAESTRO LOCADORA DE',
                month: curMonth,
                year: curYear,
                baseSalary: selectedAdminEmployee?.salary || 2500,
                additions: [],
                deductions: [
                  {
                    name: `DESC. VALE REFEIÇÃO 1% (${autoShifts} PLANTÕES)`,
                    amount: Number(vrCalc.descontoNoSueldo)
                  }
                ],
                documentType: 'salary',
                vacationStart: '',
                vacationEnd: '',
                acquisitionStart: '',
                acquisitionEnd: '',
                vacationSalary: selectedAdminEmployee?.salary || 2500,
                hasConstitutionalThird: true,
                autoCalculateTaxes: true
              });
              setAdminModalTab('form');
              setShowAddSlipModal(true);
            }}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/10 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            Enviar Holerite
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* SIDEBAR NAVIGATION: Folders / Employees Selection */}
        <div className="xl:col-span-3 space-y-6">
          {isAdmin ? (
            // ADMIN SIDEBAR: Select Employee
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-400" />
                Filtrar Colaborador
              </h3>
              
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                <button
                  onClick={() => {
                    setAdminSidebarTab('employees');
                    setSelectedSlip(null);
                    const firstEmp = employees.find(emp => emp.role !== 'admin' && emp.active !== false);
                    setSelectedAdminEmployee(firstEmp || null);
                  }}
                  type="button"
                  className={cn(
                    "flex-1 text-center py-2 px-3 text-[11px] font-bold rounded-xl transition-all cursor-pointer",
                    adminSidebarTab === 'employees' 
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Colaboradores
                </button>
                <button
                  onClick={() => {
                    setAdminSidebarTab('admins');
                    setSelectedSlip(null);
                    const firstAdmin = employees.find(emp => emp.role === 'admin' && emp.active !== false);
                    setSelectedAdminEmployee(firstAdmin || null);
                  }}
                  type="button"
                  className={cn(
                    "flex-1 text-center py-2 px-3 text-[11px] font-bold rounded-xl transition-all cursor-pointer",
                    adminSidebarTab === 'admins' 
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Administradores
                </button>
              </div>
              
              <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                {employees
                  .filter(emp => emp.active !== false && (adminSidebarTab === 'employees' ? emp.role !== 'admin' : emp.role === 'admin'))
                  .map(emp => (
                    <button 
                      key={emp.id}
                      onClick={() => {
                        setSelectedAdminEmployee(emp);
                        setSelectedSlip(null);
                      }}
                      className={cn(
                        "w-full text-left p-3.5 rounded-2xl transition-all border flex items-center justify-between group",
                        selectedAdminEmployee?.id === emp.id 
                          ? "bg-blue-50/70 border-blue-100 text-blue-700 font-bold" 
                          : "border-slate-50 hover:bg-slate-50 text-slate-600 font-medium"
                      )}
                    >
                      <div className="flex flex-col gap-0.5 truncate pr-2">
                        <span className="truncate group-hover:text-slate-900 group-hover:font-extrabold transition-all">{emp.name}</span>
                        <span className="text-[10px] opacity-75 truncate">{emp.department || 'Serviços'} • Posto: {findEmployeeServicePost(emp)} • R$ {emp.salary || '2.500'}</span>
                      </div>
                      <ChevronRight className={cn("w-4 h-4 shrink-0 transition-all opacity-0 group-hover:opacity-100", selectedAdminEmployee?.id === emp.id && "opacity-100 text-blue-600")} />
                    </button>
                  ))}
                
                {employees.filter(emp => emp.active !== false && (adminSidebarTab === 'employees' ? emp.role !== 'admin' : emp.role === 'admin')).length === 0 && (
                  <p className="text-center py-6 text-xs text-slate-400 font-medium">Nenhum registro encontrado.</p>
                )}
              </div>
            </div>
          ) : (
            // EMPLOYEE SIDEBAR: Minhas Pastas System
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
              
              <div className="space-y-2">
                <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-slate-400" />
                  Pastas Principais
                </h3>
                
                <button 
                  onClick={() => {
                    setCurrentFolderId('all');
                    setDocTypeFilter('all');
                  }}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between",
                    (currentFolderId === 'all' && docTypeFilter === 'all') ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Wallet className="w-4 h-4 shrink-0" />
                    Todos Documentos
                  </span>
                  <span className="text-[10px] bg-black/10 text-inherit px-2 py-0.5 rounded-full font-black">
                    {slips.length}
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setCurrentFolderId('unsigned');
                    setDocTypeFilter('all');
                  }}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between",
                    currentFolderId === 'unsigned' ? "bg-orange-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin" style={{ animationDuration: '6s' }} />
                    Pendentes de Envio/Assinatura
                  </span>
                  <span className="text-[10px] bg-black/10 text-inherit px-2 py-0.5 rounded-full font-black">
                    {slips.filter(s => !s.signed).length}
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setCurrentFolderId('signed');
                    setDocTypeFilter('all');
                  }}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between",
                    currentFolderId === 'signed' ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Assinados
                  </span>
                  <span className="text-[10px] bg-black/10 text-inherit px-2 py-0.5 rounded-full font-black">
                    {slips.filter(s => s.signed).length}
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setCurrentFolderId('all');
                    setDocTypeFilter('vacation');
                  }}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between",
                    (currentFolderId === 'all' && docTypeFilter === 'vacation') ? "bg-[#eab308] text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Palmtree className="w-4 h-4 shrink-0 text-amber-500 group-hover:text-amber-700" />
                    Aviso e Recibo de Férias 🌴
                  </span>
                  <span className="text-[10px] bg-black/10 text-inherit px-2 py-0.5 rounded-full font-black">
                    {slips.filter(s => s.documentType === 'vacation').length}
                  </span>
                </button>
              </div>

              <div className="h-px bg-slate-100" />

              {/* Custom Created Folders list */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest flex items-center gap-2">
                    <FolderPlus className="w-4 h-4 text-slate-400" />
                    Minhas Pastas (Arquivos)
                  </h3>
                  
                  <button 
                    onClick={() => setShowFolderInput(!showFolderInput)}
                    className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-blue-600 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <AnimatePresence>
                  {showFolderInput && (
                    <motion.div 
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex gap-2"
                    >
                      <input 
                        type="text"
                        placeholder="Nome da pasta (EX: Férias 2026)"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className="text-xs font-medium bg-slate-50 focus:bg-white border-0 focus:ring-2 focus:ring-blue-100 rounded-xl px-3 py-2 w-full text-slate-800"
                      />
                      <button 
                        onClick={handleCreateFolder}
                        className="bg-blue-600 text-white rounded-xl px-3.5 py-2 font-bold text-xs hover:bg-blue-700 transition-all cursor-pointer"
                      >
                        Criar
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                  {folders.map(folder => (
                    <div 
                      key={folder.id} 
                      className={cn(
                        "group flex items-center justify-between rounded-xl px-2.5 transition-all",
                        currentFolderId === folder.id ? "bg-slate-50" : "hover:bg-slate-50/50"
                      )}
                    >
                      <button 
                        onClick={() => setCurrentFolderId(folder.id)}
                        className={cn(
                          "flex-1 text-left py-2.5 font-semibold text-xs flex items-center gap-2",
                          currentFolderId === folder.id ? "text-blue-600 font-extrabold" : "text-slate-650"
                        )}
                      >
                        <Folder className={cn("w-3.5 h-3.5 fill-none", currentFolderId === folder.id && "text-blue-600 fill-blue-600/10")} />
                        <span className="truncate">{folder.name}</span>
                      </button>
                      
                      <button 
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="p-1 opacity-0 group-hover:opacity-100 text-slate-355 hover:text-red-500 rounded transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {folders.length === 0 && (
                    <p className="text-[11px] text-slate-300 font-medium italic text-center py-4">Personalize criando suas próprias pastas acima!</p>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* MAIN PANEL: Lists Slips */}
        <div className="xl:col-span-9 space-y-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left list block */}
            <div className="lg:col-span-5 space-y-4">
              
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    {isAdmin ? `Recibos de ${selectedAdminEmployee?.name || 'Selecionado'}` : 'Lista de Comprovantes'}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">
                    {filteredSlips.length} {filteredSlips.length === 1 ? 'slip' : 'slips'}
                  </span>
                </div>

                {/* Local search toolbar */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input 
                    type="text"
                    placeholder="Filtrar por mês ou ano..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full text-xs font-semibold pl-10 pr-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white rounded-2xl border-0 focus:ring-2 focus:ring-blue-100 text-slate-800 transition-all placeholder:text-slate-450"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Segmented docType filter tabs */}
                <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-2xl gap-1">
                  <button
                    onClick={() => setDocTypeFilter('all')}
                    className={cn(
                      "flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1",
                      docTypeFilter === 'all'
                        ? "bg-white text-slate-800 shadow-sm font-black border border-slate-200/40"
                        : "text-slate-450 hover:text-slate-700"
                    )}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setDocTypeFilter('salary')}
                    className={cn(
                      "flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                      docTypeFilter === 'salary'
                        ? "bg-white text-blue-600 shadow-sm font-black border border-slate-200/40"
                        : "text-slate-450 hover:text-slate-700"
                    )}
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Holerites
                  </button>
                  <button
                    onClick={() => setDocTypeFilter('vacation')}
                    className={cn(
                      "flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                      docTypeFilter === 'vacation'
                        ? "bg-white text-amber-600 shadow-sm font-black border border-slate-200/40"
                        : "text-slate-450 hover:text-slate-700"
                    )}
                  >
                    <Palmtree className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    Férias 🌴
                  </button>
                </div>

                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                  {filteredSlips.map((slip) => (
                    <div 
                      key={slip.id} 
                      className={cn(
                        "py-3.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-2xl transition-all group",
                        selectedSlip?.id === slip.id && "bg-slate-50/80 border border-slate-100"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex flex-col items-center justify-center text-slate-400 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all font-mono">
                          <span className="text-[8px] font-black uppercase leading-tight">{months[slip.month - 1].substring(0, 3)}</span>
                          <span className="text-xs font-black leading-tight">{slip.year}</span>
                        </div>
                        <div className="truncate">
                          <p className="font-bold text-xs text-slate-800 truncate">{months[slip.month - 1]} de {slip.year}</p>
                          <p className="text-emerald-500 font-extrabold text-[11px] font-mono tracking-tight">{formatCurrency(slip.netSalary)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {slip.signed ? (
                          <span className="p-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase" title="Assinado">
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="p-1 bg-orange-50 text-orange-500 rounded-full text-[9px] font-black uppercase" title="Assinatura Pendente">
                            <RefreshCw className="w-4 h-4 animate-spin" style={{ animationDuration: '8s' }} />
                          </span>
                        )}

                        <button 
                          onClick={() => {
                            setSelectedSlip(slip);
                            setTimeout(() => {
                              document.getElementById('holerite-preview-container')?.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                          }}
                          className={cn(
                            "p-2 rounded-xl text-slate-400 hover:text-blue-600 transition-all",
                            selectedSlip?.id === slip.id ? "bg-blue-50 text-blue-600" : "bg-white border border-slate-100 shadow-sm"
                          )}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && (
                          <button 
                            onClick={() => handleDeleteSlip(slip.id)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {filteredSlips.length === 0 && (
                    <div className="py-16 text-center">
                      <Wallet className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 font-bold text-xs">Nenhum holerite encontrado.</p>
                      <p className="text-[10px] text-slate-350 mt-1">
                        {isAdmin ? 'Para cadastrar, use o botão "Enviar Holerite" no canto superior.' : 'Os holerites enviados ficarão nesta lista.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Right Detailed Holerite Preview Sheet */}
            <div className="lg:col-span-7" id="holerite-preview-container">
              {selectedSlip ? (
                <div className="space-y-6">
                  {/* Detailed summary card */}
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm">Holerite {months[selectedSlip.month - 1]} / {selectedSlip.year}</h4>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                          selectedSlip.signed ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"
                        )}>
                          {selectedSlip.signed ? 'ASSINADO' : 'PENDENTE DE ASSINATURA'}
                        </span>

                        {selectedSlip.signed ? (
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 flex items-center gap-1 border border-emerald-200/50">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                            Cópia Salva no App do Colaborador
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 flex items-center gap-1 border border-amber-200/50">
                            <Clock className="w-2.5 h-2.5 text-amber-600" />
                            Aguardando Assinatura do Colaborador (Cópia será salva após devolução)
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-650 flex items-center gap-1">
                          <ShieldCheck className="w-2.5 h-2.5 text-slate-500" />
                          Via da Empresa
                        </span>
                        
                        {!isAdmin && folders.length > 0 && (
                          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
                            <span className="text-[9px] text-slate-450 font-bold uppercase">Pasta:</span>
                            <select 
                              value={selectedSlip.folderId || ''} 
                              onChange={(e) => handleMoveToFolder(selectedSlip.id, e.target.value || null)}
                              className="text-[9px] font-extrabold text-blue-600 bg-transparent py-0 pl-1 pr-6 border-0 focus:ring-0 cursor-pointer"
                            >
                              <option value="">Nenhuma (Unfiled)</option>
                              {folders.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                      <button 
                        onClick={handlePrint}
                        className="flex-1 sm:flex-none px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Imprimir PDF
                      </button>

                      {!selectedSlip.signed && !isAdmin && (
                        <button 
                          onClick={() => {
                            setTypedName(user?.name || '');
                            setShowSignModal(true);
                          }}
                          className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/15 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 animate-bounce" />
                          Assinar Via Celular
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Standardized Paycheck frame container with resize scaling responsive zoom */}
                  <div 
                    ref={containerRef}
                    className="overflow-hidden bg-slate-100 rounded-3xl p-3 border border-slate-250/50 shadow-inner flex justify-center w-full"
                  >
                    <div 
                      className="flex justify-start sm:justify-center items-start overflow-hidden" 
                      style={{ 
                        width: isMobileSize ? `${targetWidth * scale}px` : '100%',
                        height: isMobileSize ? `calc(${700 * scale}px + 20px)` : 'auto',
                      }}
                    >
                      <div 
                        id="payslip-print-block"
                        className="bg-white text-black p-4 printable-sheet notranslate select-none shrink-0"
                        style={{ 
                          width: `${targetWidth}px`, 
                          transform: isMobileSize ? `scale(${scale})` : 'none',
                          transformOrigin: 'top left',
                          boxShadow: isMobileSize ? 'none' : '0 10px 25px -5px rgba(0,0,0,0.05)',
                        }}
                        translate="no"
                      >
                        {/* THE OFFICIAL LOOKING BRAZILIAN HOLERITE BLOCK */}
                        {(() => {
                          const totalVencimentosFallback = selectedSlip.baseSalary + (selectedSlip.taxes?.filter((t: any) => t.type === 'addition').reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0);
                          const inssAmountFallback = selectedSlip.taxes?.filter((t: any) => t.type === 'deduction' || !t.type).find((t: any) => t.name.toUpperCase().includes('INSS'))?.amount || 0;
                          const irpfAmountFallback = selectedSlip.taxes?.filter((t: any) => t.type === 'deduction' || !t.type).find((t: any) => t.name.toUpperCase().includes('IRPF'))?.amount || 0;
                          const totalDescontosFallback = (selectedSlip.taxes?.filter((t: any) => t.type === 'deduction' || !t.type).reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0) + (selectedSlip.discounts?.reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0);

                          const hasStructuredItems = Array.isArray(selectedSlip.items) && selectedSlip.items.length > 0;
                          const slipCalculations = hasStructuredItems
                            ? calculatePayrollTotals(selectedSlip.items, selectedSlip.baseSalary)
                            : {
                                baseSalary: selectedSlip.baseSalary,
                                totalAdditions: selectedSlip.totalAdditions || totalVencimentosFallback,
                                totalDeductions: selectedSlip.totalDeductions || totalDescontosFallback,
                                netSalary: selectedSlip.netSalary,
                                salContrInss: selectedSlip.salContrInss || totalVencimentosFallback,
                                baseFgts: selectedSlip.baseFgts || totalVencimentosFallback,
                                fgtsMes: selectedSlip.fgtsMes || Number((totalVencimentosFallback * 0.08).toFixed(2)),
                                baseIrrf: selectedSlip.baseIrrf || Math.max(0, totalVencimentosFallback - inssAmountFallback),
                                faixaIrrf: selectedSlip.faixaIrrf || (irpfAmountFallback > 0 ? formatNumber(irpfAmountFallback) : 'ISENTO')
                              };

                          const totalVencimentos = slipCalculations.totalAdditions;
                          const totalDescontos = slipCalculations.totalDeductions;
                          const netSalaryDisplay = selectedSlip.netSalary ?? slipCalculations.netSalary;
                          const fgtsMesDisplay = selectedSlip.fgtsMes ?? slipCalculations.fgtsMes;
                          const salContrInssDisplay = selectedSlip.salContrInss ?? slipCalculations.salContrInss;
                          const baseFgtsDisplay = selectedSlip.baseFgts ?? slipCalculations.baseFgts;
                          const baseIrrfDisplay = selectedSlip.baseIrrf ?? slipCalculations.baseIrrf;
                          const faixaIrrfDisplay = selectedSlip.faixaIrrf ?? slipCalculations.faixaIrrf;

                          return (
                            <div className="border border-black bg-white text-black font-mono text-[9px] w-full select-none leading-none">
                              {/* ROW 1: COMPANY / CC / PERIOD */}
                              <div className="grid grid-cols-12 border-b border-black">
                                <div className="col-span-6 p-2 border-r border-black flex flex-col justify-between h-14">
                                  <div className="font-extrabold text-[10px] leading-tight text-neutral-900 tracking-tight">
                                    {company?.name || 'SENTINELA SERVIÇOS E TERCEIRIZAÇÕES LTDA'}
                                  </div>
                                  <div className="text-[7.5px] text-zinc-700 leading-none">
                                    CNPJ: {company?.cnpj || '53.704.137/0001-93'}
                                  </div>
                                </div>
                                <div className="col-span-3 p-2 border-r border-black flex flex-col justify-between text-center h-14">
                                  <div className="font-bold text-[7.5px] text-zinc-900 leading-tight truncate px-0.5" title={(targetEmployeePosto || 'MAESTRO LOCADORA DE').toUpperCase()}>
                                    CC: {(targetEmployeePosto || 'MAESTRO LOCADORA DE').toUpperCase()}
                                  </div>
                                  <div className="text-[7.5px] text-zinc-700 font-bold">
                                    Mensalista
                                  </div>
                                </div>
                                <div className="col-span-3 p-2 flex flex-col justify-between text-right h-14">
                                  <div>
                                    <div className="font-bold text-[7.5px] text-zinc-900 leading-none uppercase">
                                      Folha Mensal
                                    </div>
                                    {selectedSlip.signed ? (
                                      <div className="text-[6.5px] font-bold text-emerald-800 mt-0.5 tracking-tight">
                                        ✓ Cópia do Colaborador • Salva no App
                                      </div>
                                    ) : (
                                      <div className="text-[6.5px] font-bold text-amber-700 mt-0.5 tracking-tight">
                                        Pendente de Assinatura do Colaborador
                                      </div>
                                    )}
                                  </div>
                                  <div className="font-extrabold text-[8.5px] text-black">
                                    {months[selectedSlip.month - 1]} de {selectedSlip.year}
                                  </div>
                                </div>
                              </div>

                              {/* ROW 2: EMPLOYEE DETAILS BLOCK */}
                              <div className="grid grid-cols-12 border-b border-black bg-zinc-50/40">
                                <div className="col-span-1 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Cód.</span>
                                  <span className="font-bold text-[8.5px] block text-center">52</span>
                                </div>
                                <div className="col-span-5 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Nome do Funcionário</span>
                                  <div className="font-black text-[9px] uppercase leading-tight truncate text-neutral-950">{targetEmployeeName}</div>
                                  <div className="text-[7px] text-zinc-650 font-bold uppercase mt-0.5 tracking-tight">{targetEmployeeJob || 'VIGIA'}</div>
                                </div>
                                <div className="col-span-2 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">C.B.O.</span>
                                  <span className="font-bold text-[8.5px] block text-center">{getCboByJob(targetEmployeeJob)}</span>
                                </div>
                                <div className="col-span-1 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Depto</span>
                                  <span className="font-bold text-[8.5px] block text-center">2</span>
                                </div>
                                <div className="col-span-1 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Filial</span>
                                  <span className="font-bold text-[8.5px] block text-center">1</span>
                                </div>
                                <div className="col-span-2 p-1">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Admissão</span>
                                  <span className="font-extrabold text-[8px] block text-center">
                                    {selectedAdminEmployee?.admissionDate || user?.admissionDate 
                                      ? (() => {
                                          const admDate = selectedAdminEmployee?.admissionDate || user?.admissionDate || '';
                                          const parts = admDate.split('-');
                                          return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : admDate;
                                        })()
                                      : '20/02/2026'}
                                  </span>
                                </div>
                              </div>

                              {/* ROW 3: TABLE FOR RUBRICS HEADER */}
                              <div className="grid grid-cols-12 bg-zinc-100 border-b border-black text-[7.5px] uppercase tracking-tight text-center font-bold p-0.5 py-1">
                                <div className="col-span-1 border-r border-black">Código</div>
                                <div className="col-span-5 border-r border-black text-left pl-3">Descrição das Rubricas</div>
                                <div className="col-span-2 border-r border-black text-right pr-3">Referência</div>
                                <div className="col-span-2 border-r border-black text-right pr-3">Vencimentos (R$)</div>
                                <div className="col-span-2 text-right pr-3">Descontos (R$)</div>
                              </div>

                              {/* ROW 4: THE ITEMS MATRIX */}
                              <div className="text-[8px] min-h-[175px] bg-white relative flex flex-col justify-start">
                                {/* Columns background separators */}
                                <div className="absolute inset-0 grid grid-cols-12 pointer-events-none">
                                  <div className="col-span-1 border-r border-zinc-250 h-full"></div>
                                  <div className="col-span-5 border-r border-zinc-250 h-full"></div>
                                  <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                                  <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                                  <div className="col-span-2 h-full"></div>
                                </div>

                                <div className="relative z-10">
                                  {hasStructuredItems ? (
                                    deduplicateSlipItems(selectedSlip.items).map((item: SalarySlipLineItem, idx: number) => {
                                      const isAdd = item.type === 'addition';
                                      const isInfo = item.type === 'info' || item.code === '9382' || item.code === '9392';
                                      return (
                                        <div className="grid grid-cols-12 px-1 py-1 text-zinc-950 hover:bg-blue-50/20" key={item.id || idx}>
                                          <div className="col-span-1 text-center font-bold text-zinc-700">{item.code || '---'}</div>
                                          <div className="col-span-5 uppercase pl-3 truncate font-medium">{item.description}</div>
                                          <div className="col-span-2 text-right text-zinc-800 pr-3 font-medium">{item.reference || '-'}</div>
                                          <div className="col-span-2 text-right font-black pr-3">
                                            {isInfo ? <span className="text-zinc-300">-</span> : (isAdd ? formatNumber(item.amount) : <span className="text-zinc-300">-</span>)}
                                          </div>
                                          <div className="col-span-2 text-right font-black pr-3">
                                            {isInfo ? <span className="text-zinc-300">-</span> : (!isAdd ? <span className="text-red-650">{formatNumber(item.amount)}</span> : <span className="text-zinc-300">-</span>)}
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <>
                                      {/* 1. Base Salary Row */}
                                      <div className="grid grid-cols-12 px-1 py-1 text-zinc-950">
                                        <div className="col-span-1 text-center font-bold text-zinc-700">8781</div>
                                        <div className="col-span-5 uppercase pl-3">DIAS NORMAIS</div>
                                        <div className="col-span-2 text-right text-zinc-800 pr-3">31,00</div>
                                        <div className="col-span-2 text-right font-black pr-3">{formatNumber(selectedSlip.baseSalary)}</div>
                                        <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                      </div>

                                      {/* 2. Additions */}
                                      {selectedSlip.taxes?.filter((t: any) => t.type === 'addition').map((t: any, idx: number) => (
                                        <div className="grid grid-cols-12 px-1 py-1 text-zinc-950" key={`add-${idx}`}>
                                          <div className="col-span-1 text-center font-bold text-zinc-700">
                                            {t.code || getRubricCode(t.name, '205')}
                                          </div>
                                          <div className="col-span-5 uppercase pl-3 truncate">{t.name}</div>
                                          <div className="col-span-2 text-right text-zinc-800 pr-3">
                                            {t.reference || (t.name.includes('HORAS EXTRAS') ? '7:30' : '-')}
                                          </div>
                                          <div className="col-span-2 text-right font-black pr-3">{formatNumber(t.amount)}</div>
                                          <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                        </div>
                                      ))}

                                      {/* 3. Deductions */}
                                      {selectedSlip.taxes?.filter((t: any) => t.type === 'deduction' || !t.type).map((t: any, idx: number) => {
                                        const isINSS = t.name.toUpperCase().includes('INSS');
                                        const isIRPF = t.name.toUpperCase().includes('IRPF') || t.name.toUpperCase().includes('IMPOSTO');
                                        let refVal = t.reference || '-';
                                        if (refVal === '-') {
                                          if (isINSS) refVal = '7,90';
                                          else if (isIRPF) refVal = '7,50';
                                        }

                                        return (
                                          <div className="grid grid-cols-12 px-1 py-1 text-zinc-950" key={`tax-ded-${idx}`}>
                                            <div className="col-span-1 text-center font-bold text-zinc-700">
                                              {t.code || getRubricCode(t.name, isINSS ? '998' : '508')}
                                            </div>
                                            <div className="col-span-5 uppercase pl-3 truncate">{t.name}</div>
                                            <div className="col-span-2 text-right text-zinc-800 pr-3">{refVal}</div>
                                            <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                            <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(t.amount)}</div>
                                          </div>
                                        );
                                      })}

                                      {/* 4. Manual Discounts */}
                                      {selectedSlip.discounts?.map((d: any, idx: number) => (
                                        <div className="grid grid-cols-12 px-1 py-1 text-zinc-950" key={`disc-${idx}`}>
                                          <div className="col-span-1 text-center font-bold text-zinc-700">
                                            {d.code || getRubricCode(d.name, '620')}
                                          </div>
                                          <div className="col-span-5 uppercase pl-3 truncate">{d.name}</div>
                                          <div className="col-span-2 text-right text-zinc-800 pr-3">{d.reference || '-'}</div>
                                          <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                          <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(d.amount)}</div>
                                        </div>
                                      ))}
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* ROW 5: TOTALS ROW (SUBTOTALS) */}
                              <div className="grid grid-cols-12 border-t border-black bg-zinc-50 font-sans font-bold text-[8px] py-1 text-neutral-800">
                                <div className="col-span-8 text-right pr-3 uppercase">Total de Vencimentos</div>
                                <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-neutral-900 pr-3">
                                  {formatNumber(totalVencimentos)}
                                </div>
                                <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-red-600 pr-3">
                                  {formatNumber(totalDescontos)}
                                </div>
                              </div>

                              {/* ROW 6: VALOR LÍQUIDO BOX */}
                              <div className="grid grid-cols-12 border-t border-black border-b bg-white items-center">
                                <div className="col-span-8 p-1 px-3 flex justify-between items-center bg-zinc-50/30">
                                  <div className="text-[6.5px] uppercase font-black text-zinc-500 font-sans tracking-widest">Valor Líquido</div>
                                  <div className="text-[14px] font-sans font-bold text-zinc-950 mr-2 leading-none">⇨</div>
                                </div>
                                <div className="col-span-4 p-2 bg-zinc-100 font-mono text-right font-black text-[12px] text-zinc-950 pr-3 leading-none h-full flex items-center justify-end">
                                  <span>{formatNumber(netSalaryDisplay)}</span>
                                </div>
                              </div>

                              {/* ROW 7: REAL FOOTER CALCULATIONS STRIP (MIMICKING PHOTO EXACTLY) */}
                              <div className="grid grid-cols-12 text-[7px] text-center bg-zinc-50 uppercase divide-x divide-black h-8 leading-tight">
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Salário Base</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(slipCalculations.baseSalary)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Sal. Contr. INSS</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(salContrInssDisplay)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Base Calc. FGTS</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(baseFgtsDisplay)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">F.G.T.S do Mês</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(fgtsMesDisplay)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Base Calc. IRPF</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(baseIrrfDisplay)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Faixa IRPF</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{faixaIrrfDisplay}</span>
                                </div>
                              </div>

                              {/* SIGNATURE SECTION: SOMENTE COLABORADOR E DATA DA ASSINATURA */}
                              <div className="pt-2 border-t border-black bg-white min-h-[78px] px-2.5 pb-1.5 flex flex-col justify-between">
                                <div className="text-[6.5px] text-zinc-600 font-sans leading-tight italic">
                                  DECLARAÇÃO DE RECEBIMENTO: Reconheço que recebi a importância líquida discriminada neste recibo, correspondente à quitação das verbas remuneratórias do período indicado.
                                </div>

                                <div className="grid grid-cols-12 gap-4 items-end pt-2">
                                  {/* DATA DA ASSINATURA */}
                                  <div className="col-span-3 text-center border-t border-black pt-1">
                                    <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Data da Assinatura</span>
                                    <span className="font-extrabold text-[8px] font-mono block text-neutral-900">
                                      {selectedSlip.signed && selectedSlip.signedAt 
                                        ? format(new Date(selectedSlip.signedAt), "dd/MM/yyyy") 
                                        : '____/____/________'}
                                    </span>
                                  </div>

                                  {/* ASSINATURA DO COLABORADOR */}
                                  <div className="col-span-9 flex flex-col items-center justify-end text-center min-h-[44px]">
                                    <div className="flex-1 flex items-center justify-center mb-1">
                                      {selectedSlip.signed ? (
                                        <div className="flex flex-col items-center justify-center pointer-events-none select-none">
                                          {selectedSlip.signatureDataUrl ? (
                                            <img 
                                              src={selectedSlip.signatureDataUrl} 
                                              alt="Assinatura do Colaborador" 
                                              className="h-8 max-w-[200px] object-contain drop-shadow mix-blend-multiply" 
                                            />
                                          ) : (
                                            <span className="signature-font text-[14px] text-blue-900 font-bold italic block select-none">
                                              {selectedSlip.signatureText || targetEmployeeName}
                                            </span>
                                          )}
                                          <span className="text-[5.5px] font-mono text-zinc-500 scale-90 block mt-0.5 tracking-tighter uppercase whitespace-nowrap">
                                            ASSINADO DIGITALMENTE EM {format(new Date(selectedSlip.signedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} • IP {selectedSlip.signerIp || '177.44.12.92'} • CÓPIA ARQUIVADA NO APP
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="text-amber-700 font-bold border border-dashed border-amber-300 bg-amber-50/60 rounded px-3 py-1 uppercase tracking-wider text-[7px]">
                                          Aguardando Assinatura do Colaborador (Cópia será salva após devolução)
                                        </div>
                                      )}
                                    </div>

                                    <div className="border-t border-black w-full pt-1 font-bold text-[7.5px] uppercase truncate">
                                      ASSINATURA DO FUNCIONÁRIO • {targetEmployeeName}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Authentic certificate guarantee */}
                              <div className="text-center text-[6.5px] text-zinc-450 font-mono py-1.5 border-t border-zinc-200 bg-zinc-50/35 flex justify-between px-3 md:px-5 uppercase leading-none">
                                <span>AUTENTICAÇÃO: SHA256-{(selectedSlip.id || '').toUpperCase()}</span>
                                <span>COMPROVANTE EMITIDO CONFORME ART. 464 DA CLT COM CHAVE DE CRIPTOGRAFIA</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-10 text-center flex flex-col items-center justify-center h-[520px]">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                    <Download className="w-8 h-8 text-slate-300" />
                  </div>
                  <h4 className="text-slate-900 font-bold text-lg mb-1">Selecione um Holerite</h4>
                  <p className="text-slate-400 text-sm max-w-sm leading-relaxed mx-auto">
                    {isAdmin 
                      ? 'Selecione um funcionário e clique no ícone de visualização para inspecionar ou deletar o holerite.' 
                      : 'Clique no ícone de visualização para assinar digitalmente e organizar suas pastas.'}
                  </p>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* SIGNATURE MODAL (Employee side) */}
      <AnimatePresence>
        {showSignModal && selectedSlip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full border border-slate-100 shadow-2xl relative"
            >
              <button 
                onClick={() => setShowSignModal(false)}
                className="absolute top-6 right-6 p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-blue-600" />
                  Assinar Holerite Eletronicamente
                </h3>
                <p className="text-slate-550 text-xs mt-1">
                  Valide o recebimento eletrônico de rendimentos do mês de <strong>{months[selectedSlip.month - 1]} / {selectedSlip.year}</strong>.
                </p>
              </div>

              {/* Mode Selection Tab */}
              <div className="flex border-b border-slate-100 mb-6 font-bold text-xs uppercase">
                <button 
                  onClick={() => setSignMode('draw')}
                  className={cn(
                    "flex-1 pb-3 text-center transition-all cursor-pointer",
                    signMode === 'draw' ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"
                  )}
                >
                  Desenhar Assinatura
                </button>
                <button 
                  onClick={() => setSignMode('type')}
                  className={cn(
                    "flex-1 pb-3 text-center transition-all cursor-pointer",
                    signMode === 'type' ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"
                  )}
                >
                  Digitar Nome Completo
                </button>
              </div>

              {signMode === 'draw' ? (
                // Draw Canvas Mode
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-400">ESPAÇO DA CANETA DIGITAL</span>
                      <button 
                        type="button"
                        onClick={() => setIsRotated(!isRotated)}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer text-[10px]"
                      >
                        <RotateCw className="w-3 h-3 animate-spin-slow" />
                        {isRotated ? "Girar Normal" : "Girar Tela (90°)"}
                      </button>
                    </div>
                    <button 
                      onClick={clearCanvas}
                      className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                    >
                      Limpar Tela
                    </button>
                  </div>
                  
                  <div className={cn(
                    "bg-slate-50 rounded-2xl border border-slate-200/60 overflow-hidden relative flex items-center justify-center transition-all duration-300",
                    isRotated ? "h-72" : "h-40"
                  )}>
                    <canvas 
                      ref={canvasRef}
                      width={600}
                      height={200}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className={cn(
                        "w-full h-full bg-transparent cursor-crosshair touch-none origin-center transition-all duration-300",
                        isRotated ? "rotate-90 scale-125" : ""
                      )}
                    />
                    {!isRotated && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-350 select-none text-[10px] font-bold uppercase tracking-widest opacity-35">
                        Assine aqui na tela
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Type Name Mode
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Nome do Depositário</label>
                    <input 
                      type="text"
                      placeholder="Nome completo igual ao documento"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white rounded-2xl border-0 focus:ring-2 focus:ring-blue-100 text-slate-800 text-sm transition-all"
                    />
                  </div>

                  <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-2xl flex flex-col items-center justify-center h-28 text-center relative overflow-hidden select-none">
                    <span className="absolute top-1 text-[8px] uppercase tracking-wider font-extrabold text-slate-405">Visualização de Assinatura</span>
                    <p className="signature-font text-[24px] text-blue-900 leading-none italic block whitespace-nowrap mt-2 animate-pulse">
                      {typedName.trim() || 'Sua Assinatura Cursiva'}
                    </p>
                  </div>
                </div>
              )}

              {/* Disclaimer Agreement */}
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl my-6 flex gap-3">
                <input 
                  type="checkbox"
                  id="agree-holerite"
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-400 mt-0.5 cursor-pointer"
                  defaultChecked
                />
                <label htmlFor="agree-holerite" className="text-[11px] text-slate-550 leading-relaxed cursor-pointer select-none">
                  Fui devidamente pago no valor líquido de rendimentos supracitado e aceito o visto digital com força legal e quitação irrevogável.
                </label>
              </div>

              {/* Active Actions */}
              <button 
                onClick={handleSignatureSubmit}
                disabled={signingState || (signMode === 'type' && !typedName.trim())}
                className="w-full py-4 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {signingState ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando Cópia ao Administrador...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    Confirmar Assinatura Digital
                  </>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADMIN ENVIAR HOLERITE DRAW MODAL */}
      <AnimatePresence>
        {showAddSlipModal && isAdmin && selectedAdminEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 lg:p-8 max-w-xl lg:max-w-5xl w-full border border-slate-100 shadow-2xl relative my-8 transition-all duration-300"
            >
              <button 
                onClick={() => setShowAddSlipModal(false)}
                className="absolute top-6 right-6 p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all cursor-pointer z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6 pr-8">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Send className="w-6 h-6 text-blue-600 animate-pulse" />
                  Enviar Holerite / Holerite Customizado
                </h3>
                <p className="text-slate-500 text-xs mt-1">
                  Verifique e valide os dados da folha antes de despachar o documento oficial sob as leis trabalhistas.
                </p>
              </div>

              {/* Tab Selector for Mobile (stacked) layout */}
              <div className="flex border-b border-slate-100 mb-6 lg:hidden">
                <button
                  type="button"
                  onClick={() => setAdminModalTab('form')}
                  className={cn(
                    "flex-1 py-3 font-bold text-xs uppercase tracking-wider border-b-2 text-center transition-all cursor-pointer",
                    adminModalTab === 'form' ? "border-blue-600 text-blue-600 font-extrabold" : "border-transparent text-slate-400 font-medium"
                  )}
                >
                  📝 Lançamentos & IA
                </button>
                <button
                  type="button"
                  onClick={() => setAdminModalTab('preview')}
                  className={cn(
                    "flex-1 py-3 font-bold text-xs uppercase tracking-wider border-b-2 text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    adminModalTab === 'preview' ? "border-blue-600 text-blue-600 font-extrabold" : "border-transparent text-slate-400 font-medium"
                  )}
                >
                  <Eye className="w-4 h-4" /> Prévia Real ({formatCurrency(previewCalc.netSalary)})
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* COLUMN 1: FORM CONTROLS */}
                <div className={cn(
                  "lg:col-span-6 space-y-4 max-h-[560px] overflow-y-auto pr-1",
                  adminModalTab === 'form' ? "block" : "hidden lg:block bg-white"
                )}>
                  {/* Mode Selector Tabs: Upload Inteligente vs Preenchimento Manual */}
                  <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setSlipCreationMode('upload')}
                      className={cn(
                        "flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-2",
                        slipCreationMode === 'upload'
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/60 font-extrabold"
                          : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      1. Upload Inteligente (IA/PDF)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlipCreationMode('manual')}
                      className={cn(
                        "flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center gap-2",
                        slipCreationMode === 'manual'
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/60 font-extrabold"
                          : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      <Edit3 className="w-4 h-4 text-blue-500" />
                      2. Preenchimento Manual
                    </button>
                  </div>

                  {/* Mode 1: AI Document Parser Box */}
                  {slipCreationMode === 'upload' && (
                    <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-100 rounded-3xl p-5 space-y-3 shadow-xs animate-fade-in">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-blue-600 text-white rounded-lg">
                            <Sparkles className="w-4 h-4 animate-pulse" />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-xs text-blue-950 uppercase tracking-wide">Importação Inteligente com IA</h4>
                            <p className="text-[10px] text-blue-600 font-bold">Extraia dados de holerites (fotos, PDFs ou TXT)</p>
                          </div>
                        </div>
                      </div>

                      {isParsingAI ? (
                        <div className="flex flex-col items-center justify-center p-4 py-6 bg-white rounded-2xl border border-dashed border-blue-200 gap-3">
                          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                          <p className="text-xs font-bold text-slate-655 animate-pulse text-center">
                            A IA está analisando este contracheque...
                          </p>
                          <span className="text-[9px] text-slate-400">Interpretando códigos, referências, salários e identificando colaborador</span>
                        </div>
                      ) : (
                        <div>
                          <div 
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              aiFileInputRef.current?.click();
                            }}
                            className={cn(
                              "flex flex-col items-center justify-center p-4 py-5 rounded-2xl border border-dashed transition-all cursor-pointer select-none text-center",
                              isDragActive 
                                ? "bg-blue-50/90 border-blue-500 scale-[1.01] shadow-md shadow-blue-100" 
                                : "bg-white border-slate-200 hover:bg-slate-50/50 hover:border-blue-300"
                            )}
                          >
                            <Upload className={cn("w-5 h-5 mb-1 transition-all", isDragActive ? "text-blue-600 scale-110" : "text-slate-450")} />
                            <p className="text-xs font-bold text-slate-750">Selecione ou solte o arquivo do Holerite</p>
                            <span className="text-[9px] text-slate-400">Imagens (PNG/JPG), PDF ou TXT</span>
                          </div>
                          <input 
                            ref={aiFileInputRef}
                            type="file" 
                            accept="image/*,application/pdf,text/plain" 
                            onChange={handleAIFileUpload} 
                            className="hidden" 
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}

                      {aiSuccessMessage && (
                        <div className="bg-emerald-50 border border-emerald-100/70 text-emerald-800 p-3 rounded-xl text-[10px] font-medium flex items-start gap-2 animate-fade-in">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-extrabold text-emerald-950">Processamento Concluído</p>
                            <p className="opacity-90">{aiSuccessMessage}</p>
                            <span className="block mt-1 text-[9px] font-bold text-emerald-700">
                              Os lançamentos foram preenchidos na tabela abaixo. Você pode ajustar qualquer rubrica manualmente.
                            </span>
                          </div>
                        </div>
                      )}

                      {aiError && (
                        <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-xl text-[10px] font-medium flex items-start gap-2 animate-rose-fade">
                          <Info className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-extrabold text-rose-950">Falha no Processamento</p>
                            <p className="opacity-95">{aiError}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 2: Manual Rubric Entry & Catalog Controls */}
                  <div className="bg-white border border-slate-200/90 rounded-3xl p-4.5 space-y-3.5 shadow-xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-blue-600" />
                        <h4 className="font-black text-xs text-slate-800 uppercase tracking-wide">
                          Lançamento de Rubricas no Contra-Cheque
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowRubricsCatalogModal(true)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black flex items-center gap-1.5 transition-colors cursor-pointer border border-blue-200/60"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Catálogo de Códigos & Rubricas
                      </button>
                    </div>

                    {/* Fast rubric selector from catalog */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Selecionar Rubrica do Catálogo (Preenchimento Rápido)
                      </label>
                      <select
                        value={selectedCatalogCode}
                        onChange={(e) => handleSelectCatalogRubric(e.target.value)}
                        className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
                      >
                        <option value="">-- Escolha uma rubrica do catálogo (ex: 8781, 0150, 998, 508...) --</option>
                        {allRubrics.map((r, idx) => (
                          <option key={`${r.code}-${r.type}-${idx}`} value={`${r.code}:::${r.type}`}>
                            {r.code} - {r.name} ({r.type === 'addition' ? 'Vencimento' : (r.type === 'info' ? 'Somente Referência' : 'Desconto')}{r.defaultReference ? ` • Ref: ${r.defaultReference}` : ''})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Inputs: Código, Descrição, Referência, Tipo, Valor */}
                    <div className="grid grid-cols-12 gap-2 pt-1">
                      <div className="col-span-3">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Código</label>
                        <input
                          type="text"
                          placeholder="Ex: 8781"
                          value={itemInput.code}
                          onChange={(e) => {
                            const newCode = e.target.value;
                            const match = allRubrics.find(r => r.code === newCode.trim());
                            if (match) {
                              setItemInput(prev => ({
                                ...prev,
                                code: newCode,
                                description: prev.description && prev.description !== '-' ? prev.description : match.name,
                                type: match.type,
                                reference: prev.reference && prev.reference !== '-' ? prev.reference : (match.defaultReference || '-')
                              }));
                            } else {
                              setItemInput(prev => ({ ...prev, code: newCode }));
                            }
                          }}
                          className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 focus:ring-2 focus:ring-blue-100 uppercase"
                        />
                      </div>
                      <div className="col-span-6">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Descrição da Rubrica</label>
                        <input
                          type="text"
                          placeholder="Ex: DIAS NORMAIS ou HORAS EXTRAS 50%"
                          value={itemInput.description}
                          onChange={(e) => setItemInput({ ...itemInput, description: e.target.value })}
                          className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 focus:ring-2 focus:ring-blue-100 uppercase"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Referência</label>
                        <input
                          type="text"
                          placeholder="31,00 ou 7:30"
                          value={itemInput.reference}
                          onChange={(e) => setItemInput({ ...itemInput, reference: e.target.value })}
                          className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>

                      <div className="col-span-7 flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-700 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="rubricType"
                            checked={itemInput.type === 'addition'}
                            onChange={() => setItemInput({ ...itemInput, type: 'addition' })}
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-0 cursor-pointer"
                          />
                          <span className="text-emerald-700 font-bold">Vencimento (+)</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-700 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="rubricType"
                            checked={itemInput.type === 'deduction'}
                            onChange={() => setItemInput({ ...itemInput, type: 'deduction' })}
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-0 cursor-pointer"
                          />
                          <span className="text-red-650 font-bold">Desconto (-)</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] font-black text-slate-700 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="rubricType"
                            checked={itemInput.type === 'info' || itemInput.code === '9382' || itemInput.code === '9392'}
                            onChange={() => setItemInput({ ...itemInput, type: 'info', amount: '0' })}
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-0 cursor-pointer"
                          />
                          <span className="text-blue-700 font-bold">Somente Ref.</span>
                        </label>
                      </div>

                      <div className="col-span-3">
                        {itemInput.type === 'info' || itemInput.code === '9382' || itemInput.code === '9392' ? (
                          <div className="w-full h-full text-[10px] font-bold text-slate-400 bg-slate-100/90 border border-slate-200 rounded-xl px-2 py-2 flex items-center justify-center">
                            Somente Ref. (-)
                          </div>
                        ) : (
                          <input
                            type="number"
                            placeholder="Valor R$"
                            value={itemInput.amount}
                            onChange={(e) => setItemInput({ ...itemInput, amount: e.target.value })}
                            className="w-full h-full text-xs font-black bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-slate-800 focus:ring-2 focus:ring-blue-100"
                          />
                        )}
                      </div>

                      <div className="col-span-2">
                        <button
                          type="button"
                          onClick={handleAddLineItem}
                          className="w-full h-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs cursor-pointer flex items-center justify-center gap-1 shadow-sm transition-all"
                        >
                          <Plus className="w-4 h-4" /> Add
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Posto de Serviço / Centro de Custo (CC do Holerite) */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase text-slate-600 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-blue-600" />
                        Posto de Serviço (CC - Centro de Custo)
                      </label>
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50">
                        {newSlipForm.postoName ? 'Posto Definido' : 'Auto-Detectado'}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        list="service-posts-datalist"
                        value={newSlipForm.postoName || ''}
                        onChange={(e) => setNewSlipForm({ ...newSlipForm, postoName: e.target.value })}
                        placeholder="Ex: MAESTRO LOCADORA DE, RSN LOGISTICA..."
                        className="w-full text-xs font-black uppercase bg-white rounded-xl px-3.5 py-2.5 text-slate-800 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:normal-case placeholder:font-normal"
                      />
                      <datalist id="service-posts-datalist">
                        {servicePosts.map(p => (
                          <option key={p.id} value={p.name} />
                        ))}
                        <option value="MAESTRO LOCADORA DE" />
                        <option value="RSN LOGISTICA" />
                        <option value="PORTARIA PRINCIPAL" />
                      </datalist>
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-slate-500 font-medium">
                      <span>Nome do posto onde o serviço é prestado.</span>
                      <span className="font-extrabold text-blue-600 uppercase">
                        CC: {(newSlipForm.postoName || findEmployeeServicePost(selectedAdminEmployee) || 'MAESTRO LOCADORA DE').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Document Type Selector */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewSlipForm({ ...newSlipForm, documentType: 'salary' })}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-black uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                        newSlipForm.documentType === 'salary'
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/50 font-extrabold"
                          : "text-slate-450 hover:text-slate-700"
                      )}
                    >
                      <FileText className="w-4 h-4 text-slate-500" />
                      Holerite Mensal
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSlipForm({ ...newSlipForm, documentType: 'vacation' })}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-black uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                        newSlipForm.documentType === 'vacation'
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/50 font-extrabold"
                          : "text-slate-450 hover:text-slate-700"
                      )}
                    >
                      🌴 Enviar Férias
                    </button>
                  </div>

                  {newSlipForm.documentType === 'vacation' ? (
                    <div className="space-y-4 bg-blue-50/20 border border-blue-100 rounded-2xl p-4 animate-fade-in">
                      <h4 className="text-xs font-black uppercase text-blue-900 flex items-center gap-1.5">
                        🌴 Detalhes do Período de Férias
                      </h4>
                      <p className="text-[10px] text-blue-600 leading-tight">
                        Especifique as datas reais de gozo e os períodos aquisitivos oficiais para a folha de férias eletrônica.
                      </p>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Início do Gozo *</label>
                          <input 
                            type="date"
                            value={newSlipForm.vacationStart}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, vacationStart: e.target.value })}
                            className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Fim do Gozo *</label>
                          <input 
                            type="date"
                            value={newSlipForm.vacationEnd}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, vacationEnd: e.target.value })}
                            className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Início Per. Aquisitivo</label>
                          <input 
                            type="date"
                            value={newSlipForm.acquisitionStart}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, acquisitionStart: e.target.value })}
                            className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Fim Per. Aquisitivo</label>
                          <input 
                            type="date"
                            value={newSlipForm.acquisitionEnd}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, acquisitionEnd: e.target.value })}
                            className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Valor Base de Férias (R$)</label>
                        <input 
                          type="number"
                          value={newSlipForm.vacationSalary}
                          onChange={(e) => setNewSlipForm({ ...newSlipForm, vacationSalary: Number(e.target.value) })}
                          className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                        />
                      </div>

                      <label className="flex items-center gap-2 select-none cursor-pointer mt-2 text-xs font-bold text-slate-700">
                        <input 
                          type="checkbox"
                          checked={newSlipForm.hasConstitutionalThird}
                          onChange={(e) => setNewSlipForm({ ...newSlipForm, hasConstitutionalThird: e.target.checked })}
                          className="rounded text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer text-xs"
                        />
                        Adicionar 1/3 (Terço Constitucional CLT)
                      </label>
                    </div>
                  ) : (
                    <>
                      {/* Competence Picker row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Mês de Competência</label>
                          <select 
                            value={newSlipForm.month}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, month: Number(e.target.value) })}
                            className="w-full text-xs font-bold bg-slate-50 rounded-xl px-3 py-2 text-slate-705 focus:outline-none focus:ring-2 focus:ring-blue-105"
                          >
                            {months.map((m, i) => (
                              <option key={i} value={i + 1}>{m}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Ano</label>
                          <input 
                            type="number"
                            value={newSlipForm.year}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, year: Number(e.target.value) })}
                            className="w-full text-xs font-bold bg-slate-50 rounded-xl px-3 py-2 text-slate-705 focus:outline-none focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                      </div>

                      {/* Base Salary & Automation controls */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-blue-50/60 rounded-2xl border border-blue-100">
                          <div className="flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-blue-600" />
                            <div>
                              <span className="text-xs font-black text-blue-950 block">Cálculo Automático de INSS & IRRF</span>
                              <span className="text-[10px] text-blue-700 font-medium">
                                Recalcula alíquotas oficiais CLT em tempo real conforme os proventos são adicionados.
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleAutoRecalculateTaxes}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black cursor-pointer shadow-xs transition-colors whitespace-nowrap"
                          >
                            ⚡ Atualizar INSS & IRRF
                          </button>
                        </div>

                        {/* Bloco de Cálculo Automático de Ponto e Vale Refeição (1% Desconto no Holerite) */}
                        <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-black text-emerald-950 block">
                                Vale Refeição Automático (R$ 26,40/plantão • 1% Desconto)
                              </span>
                              <span className="text-[10px] text-emerald-700 font-semibold">
                                Créd. Cartão: <strong>R$ {calcularPontoEValeAutomatico(slipPlantoes).totalCreditoCartao.replace('.', ',')}</strong> • Desconto Holerite (1%): <strong>R$ {calcularPontoEValeAutomatico(slipPlantoes).descontoNoSueldo.replace('.', ',')}</strong>
                              </span>
                            </div>
                            {detectedSlipShifts > 0 && (
                              <button
                                type="button"
                                onClick={() => applyValeDiscountToSlip(detectedSlipShifts)}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-black cursor-pointer hover:bg-emerald-700"
                              >
                                Ponto: {detectedSlipShifts} plantões
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={31}
                              value={slipPlantoes}
                              onChange={(e) => applyValeDiscountToSlip(Number(e.target.value))}
                              className="w-16 px-2 py-1 bg-white border border-emerald-200 rounded-xl text-xs font-black text-center text-slate-800"
                            />
                            <button
                              type="button"
                              onClick={() => applyValeDiscountToSlip(15)}
                              className={cn(
                                "px-2.5 py-1 rounded-xl text-[10px] font-black border transition-all cursor-pointer",
                                slipPlantoes === 15
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                              )}
                            >
                              15 Plantões (Desc. R$ 3,96)
                            </button>
                            <button
                              type="button"
                              onClick={() => applyValeDiscountToSlip(16)}
                              className={cn(
                                "px-2.5 py-1 rounded-xl text-[10px] font-black border transition-all cursor-pointer",
                                slipPlantoes === 16
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                              )}
                            >
                              16 Plantões (Desc. R$ 4,22)
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Interactive Rubrics Table */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ListPlus className="w-4 h-4 text-slate-600" />
                        <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide">
                          Rubricas Registradas na Folha ({newSlipItems.length})
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">
                        Edite valores ou referências diretamente nas linhas
                      </span>
                    </div>

                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-600 font-black text-[9px] uppercase border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-2.5 text-center w-14">Cód.</th>
                            <th className="py-2 px-2">Descrição</th>
                            <th className="py-2 px-2 text-center w-20">Ref.</th>
                            <th className="py-2 px-2 text-right w-24">Vencimento</th>
                            <th className="py-2 px-2 text-right w-24">Desconto</th>
                            <th className="py-2 px-2 text-center w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {newSlipItems.map((item, idx) => {
                            const isAdd = item.type === 'addition';
                            const isInfo = item.type === 'info' || item.code === '9382' || item.code === '9392';
                            return (
                              <tr key={item.id || idx} className="hover:bg-slate-50/70 transition-colors">
                                <td className="py-1 px-1.5 text-center">
                                  <input
                                    type="text"
                                    value={item.code || ''}
                                    onChange={(e) => handleUpdateLineItem(idx, 'code', e.target.value)}
                                    className="w-16 text-xs font-mono font-black text-center bg-slate-50 border border-slate-200 rounded px-1 py-1 focus:bg-white uppercase focus:ring-1 focus:ring-blue-400"
                                    placeholder="Cód."
                                  />
                                </td>
                                <td className="py-1 px-1.5">
                                  <input
                                    type="text"
                                    value={item.description || ''}
                                    onChange={(e) => handleUpdateLineItem(idx, 'description', e.target.value)}
                                    className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:bg-white uppercase focus:ring-1 focus:ring-blue-400"
                                    placeholder="Descrição da rubrica"
                                  />
                                </td>
                                <td className="py-1 px-1.5 text-center">
                                  <input
                                    type="text"
                                    value={item.reference || ''}
                                    onChange={(e) => handleUpdateLineItem(idx, 'reference', e.target.value)}
                                    className="w-full text-[10px] font-bold text-center bg-slate-50 border border-slate-200 rounded px-1 py-1 focus:bg-white"
                                  />
                                </td>
                                <td className="py-1 px-1.5 text-right font-mono">
                                  {isInfo ? (
                                    <span className="text-slate-300 font-mono text-center block text-xs" title="Somente Referência">-</span>
                                  ) : isAdd ? (
                                    <input
                                      type="number"
                                      value={item.amount || ''}
                                      onChange={(e) => handleUpdateLineItem(idx, 'amount', Number(e.target.value))}
                                      className="w-full text-xs font-black text-right text-emerald-700 bg-emerald-50/40 border border-emerald-200 rounded px-1.5 py-1 focus:bg-white"
                                    />
                                  ) : (
                                    <span className="text-slate-300 pr-2">-</span>
                                  )}
                                </td>
                                <td className="py-1 px-1.5 text-right font-mono">
                                  {isInfo ? (
                                    <span className="text-slate-300 font-mono text-center block text-xs" title="Somente Referência">-</span>
                                  ) : !isAdd ? (
                                    <input
                                      type="number"
                                      value={item.amount || ''}
                                      onChange={(e) => handleUpdateLineItem(idx, 'amount', Number(e.target.value))}
                                      className="w-full text-xs font-black text-right text-red-650 bg-rose-50/40 border border-rose-200 rounded px-1.5 py-1 focus:bg-white"
                                    />
                                  ) : (
                                    <span className="text-slate-300 pr-2">-</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveLineItem(idx)}
                                    className="text-slate-300 hover:text-red-500 cursor-pointer p-1 transition-colors"
                                    title="Remover rubrica"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Real-time Calculation Statistics Strip */}
                  <div className="bg-slate-900 text-white rounded-2xl p-3.5 space-y-2.5 shadow-md">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                        Cálculos Oficiais Automáticos (CLT)
                      </span>
                      <span className="text-xs font-mono font-extrabold text-emerald-400">
                        Líquido: {formatCurrency(previewCalc.netSalary)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[9px] font-mono">
                      <div className="bg-slate-800/80 p-2 rounded-xl">
                        <span className="block text-[7px] text-slate-400 uppercase font-sans">Salário Base</span>
                        <span className="font-extrabold text-white">{formatCurrency(previewCalc.baseSalary)}</span>
                      </div>
                      <div className="bg-slate-800/80 p-2 rounded-xl">
                        <span className="block text-[7px] text-slate-400 uppercase font-sans">Sal. Contr. INSS</span>
                        <span className="font-extrabold text-white">{formatCurrency(previewCalc.salContrInss)}</span>
                      </div>
                      <div className="bg-slate-800/80 p-2 rounded-xl">
                        <span className="block text-[7px] text-slate-400 uppercase font-sans">Base Cálc. FGTS</span>
                        <span className="font-extrabold text-white">{formatCurrency(previewCalc.baseFgts)}</span>
                      </div>
                      <div className="bg-slate-800/80 p-2 rounded-xl">
                        <span className="block text-[7px] text-slate-400 uppercase font-sans">FGTS do Mês</span>
                        <span className="font-extrabold text-white">{formatCurrency(previewCalc.fgtsMes)}</span>
                      </div>
                      <div className="bg-slate-800/80 p-2 rounded-xl">
                        <span className="block text-[7px] text-slate-400 uppercase font-sans">Base Cálc. IRRF</span>
                        <span className="font-extrabold text-white">{formatCurrency(previewCalc.baseIrrf)}</span>
                      </div>
                      <div className="bg-slate-800/80 p-2 rounded-xl">
                        <span className="block text-[7px] text-slate-400 uppercase font-sans">Faixa IRRF</span>
                        <span className="font-extrabold text-amber-400">{previewCalc.faixaIrrf}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: HIGH FIDELITY REAL-TIME PAYCHECK PREVIEW */}
                <div className={cn(
                  "lg:col-span-6 space-y-4 max-h-[560px] overflow-y-auto bg-slate-50 border border-slate-150 rounded-[2rem] p-4 lg:p-5 flex flex-col justify-start relative",
                  adminModalTab === 'preview' ? "block" : "hidden lg:block bg-slate-50"
                )}>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-[9px] font-black uppercase text-slate-400 font-mono tracking-wider">Demonstrativo de Holerite Digital (Prévia Real)</span>
                    <span className="px-2 py-0.5 bg-blue-600 text-white text-[8px] font-black uppercase rounded font-mono">Prévia Viva</span>
                  </div>
                  <div className="bg-white border border-black text-black font-mono text-[9px] w-full select-none leading-none">
                    {(() => {
                      const totalVencimentos = previewCalc.totalAdditions;
                      const totalDescontos = previewCalc.totalDeductions;
                      const fgtsBase = previewCalc.baseFgts;
                      const fgtsAmount = previewCalc.fgtsMes;
                      const irpfBase = previewCalc.baseIrrf;

                      if (previewCalc.isVacation) {
                        const formatDateBR = (dateStr: string) => {
                          if (!dateStr) return '__/__/____';
                          const parts = dateStr.split('-');
                          if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                          return dateStr;
                        };

                        return (
                          <>
                            {/* ROW 1: COMPANY / HEADER */}
                            <div className="grid grid-cols-12 border-b border-black">
                              <div className="col-span-7 p-2 border-r border-black flex flex-col justify-between h-14">
                                <div className="font-extrabold text-[10px] leading-tight text-neutral-900 tracking-tight">
                                  {company?.name || 'SENTINELA SERVIÇOS E TERCEIRIZAÇÕES LTDA'}
                                </div>
                                <div className="text-[7.5px] text-zinc-700 leading-none">
                                  CNPJ: {company?.cnpj || '53.704.137/0001-93'}
                                </div>
                              </div>
                              <div className="col-span-5 p-2 flex flex-col justify-between text-right h-14">
                                <div className="font-extrabold text-[9px] text-blue-600 leading-none uppercase font-mono">
                                  Recibo e Aviso de Férias
                                </div>
                                <div className="text-[7px] text-zinc-650 leading-tight">
                                  Art. 135 da CLT
                                </div>
                              </div>
                            </div>

                            {/* ROW 2: EMPLOYEE DETAILS */}
                            <div className="grid grid-cols-12 border-b border-black bg-zinc-50/40">
                              <div className="col-span-6 p-1.5 border-r border-black">
                                <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Nome do Funcionário</span>
                                <div className="font-black text-[9px] uppercase leading-tight truncate text-neutral-950">{selectedAdminEmployee.name}</div>
                                <div className="text-[7px] text-zinc-650 font-bold uppercase mt-0.5 tracking-tight">{selectedAdminEmployee.department || 'VIGIA'}</div>
                              </div>
                              <div className="col-span-3 p-1.5 border-r border-black">
                                <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Período Aquisitivo</span>
                                <div className="font-extrabold text-[8px] text-neutral-950">
                                  {formatDateBR(previewCalc.acquisitionStart)} a {formatDateBR(previewCalc.acquisitionEnd)}
                                </div>
                              </div>
                              <div className="col-span-3 p-1.5">
                                <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Período de Gozo</span>
                                <div className="font-extrabold text-[8px] text-blue-700">
                                  {formatDateBR(previewCalc.vacationStart)} a {formatDateBR(previewCalc.vacationEnd)}
                                </div>
                              </div>
                            </div>

                            {/* ROW 3: TABLE HEADER */}
                            <div className="grid grid-cols-12 bg-zinc-100 border-b border-black text-[7.5px] uppercase tracking-tight text-center font-bold p-0.5 py-1">
                              <div className="col-span-1 border-r border-black font-semibold">Código</div>
                              <div className="col-span-5 border-r border-black text-left pl-3 font-semibold">Descrição do Lançamento de Férias</div>
                              <div className="col-span-2 border-r border-black text-right pr-3 font-semibold">Referência</div>
                              <div className="col-span-2 border-r border-black text-right pr-3 font-semibold">Proventos</div>
                              <div className="col-span-2 text-right pr-3 font-semibold">Descontos</div>
                            </div>

                            {/* ROW 4: ITEMS MATRIX */}
                            <div className="text-[8px] min-h-[145px] bg-white relative flex flex-col justify-start">
                              <div className="absolute inset-0 grid grid-cols-12 pointer-events-none">
                                <div className="col-span-1 border-r border-zinc-250 h-full"></div>
                                <div className="col-span-5 border-r border-zinc-250 h-full"></div>
                                <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                                <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                                <div className="col-span-2 h-full"></div>
                              </div>

                              <div className="relative z-10">
                                <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950">
                                  <div className="col-span-1 text-center font-bold text-zinc-700">0220</div>
                                  <div className="col-span-5 uppercase pl-3">VALOR DAS FÉRIAS (GOZO)</div>
                                  <div className="col-span-2 text-right text-zinc-800 pr-3 font-bold">30 Dias</div>
                                  <div className="col-span-2 text-right font-black pr-3">{formatNumber(previewCalc.vacationSalary || 0)}</div>
                                  <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                </div>

                                {previewCalc.hasConstitutionalThird && (
                                  <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950">
                                    <div className="col-span-1 text-center font-bold text-zinc-700">0221</div>
                                    <div className="col-span-5 uppercase pl-3">TERÇO CONSTITUCIONAL DE FÉRIAS (1/3)</div>
                                    <div className="col-span-2 text-right text-zinc-800 pr-3 font-bold">33,33%</div>
                                    <div className="col-span-2 text-right font-black pr-3">{formatNumber(previewCalc.constThird || 0)}</div>
                                    <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                  </div>
                                )}

                                {previewCalc.taxes.filter(t => t.type === 'addition').map((a, idx) => (
                                  <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950" key={`prev-vac-add-${idx}`}>
                                    <div className="col-span-1 text-center font-bold text-zinc-700">0205</div>
                                    <div className="col-span-5 uppercase pl-3 truncate">{a.name}</div>
                                    <div className="col-span-2 text-right text-zinc-800 pr-3">-</div>
                                    <div className="col-span-2 text-right font-black pr-3">{formatNumber(a.amount)}</div>
                                    <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                  </div>
                                ))}

                                {previewCalc.taxes.filter(t => t.type === 'deduction').map((t, idx) => {
                                  const isINSS = t.name.toUpperCase().includes('INSS');
                                  return (
                                    <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950" key={`prev-vac-ded-${idx}`}>
                                      <div className="col-span-1 text-center font-bold text-zinc-700">
                                        {isINSS ? '0910' : '0514'}
                                      </div>
                                      <div className="col-span-5 uppercase pl-3 truncate">{t.name}</div>
                                      <div className="col-span-2 text-right text-zinc-800 pr-3">-</div>
                                      <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                      <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(t.amount)}</div>
                                    </div>
                                  );
                                })}

                                {previewCalc.discounts.map((d, idx) => (
                                  <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950" key={`prev-vac-disc-${idx}`}>
                                    <div className="col-span-1 text-center font-bold text-zinc-700">0620</div>
                                    <div className="col-span-5 uppercase pl-3 truncate">{d.name}</div>
                                    <div className="col-span-2 text-right text-zinc-800 pr-3">-</div>
                                    <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                    <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(d.amount)}</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* ROW 5: TOTALS ROW */}
                            <div className="grid grid-cols-12 border-t border-black bg-zinc-50 font-sans font-bold text-[8px] py-1 text-neutral-800">
                              <div className="col-span-8 text-right pr-3 uppercase">Totalizador de Férias</div>
                              <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-neutral-900 pr-3">
                                {formatNumber(totalVencimentos)}
                              </div>
                              <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-red-605 pr-3">
                                {formatNumber(totalDescontos)}
                              </div>
                            </div>

                            {/* ROW 6: NET SALARY */}
                            <div className="grid grid-cols-12 border-t border-black border-b bg-white items-center">
                              <div className="col-span-8 p-1 px-3 flex justify-between items-center bg-zinc-50/20">
                                <div className="text-[6.5px] uppercase font-black text-zinc-500 font-sans tracking-widest">Valor Líquido das Férias</div>
                                <div className="text-[14px] font-sans font-bold text-zinc-950 mr-2 leading-none">⇨</div>
                              </div>
                              <div className="col-span-4 p-1.5 bg-zinc-100 font-mono text-right font-black text-[11px] text-zinc-950 pr-3 leading-none h-full flex items-center justify-end">
                                <span>{formatNumber(previewCalc.netSalary)}</span>
                              </div>
                            </div>

                            {/* ROW 7: FOOTER NOTES */}
                            <div className="p-2 text-[6px] leading-[1.1] text-zinc-500 border-t border-zinc-250">
                              * COMUNICAMOS QUE AS FÉRIAS SERÃO CONCEDIDAS AO COLABORADOR NO PERÍODO DESIGNADO. ESTE DOCUMENTO CONSTITUI AVISO PRÉVIO E COMPROVANTE ELETRÔNICO SOB AS REGRAS CLT.
                            </div>

                            {/* SIGNATURE SECTION PREVIEW: SOMENTE COLABORADOR E DATA */}
                            <div className="pt-2 border-t border-black bg-white min-h-[70px] px-2.5 pb-1 flex flex-col justify-between">
                              <div className="text-[6px] text-zinc-600 font-sans leading-tight italic">
                                DECLARAÇÃO DE RECEBIMENTO DE FÉRIAS: Reconheço que recebi a quantia líquida supra discriminada, correspondente às minhas férias e abonos legais.
                              </div>

                              <div className="grid grid-cols-12 gap-3 items-end pt-1.5">
                                <div className="col-span-3 text-center border-t border-black pt-1">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Data da Assinatura</span>
                                  <span className="font-extrabold text-[7.5px] font-mono block text-neutral-500">
                                    ____/____/________
                                  </span>
                                </div>

                                <div className="col-span-9 flex flex-col items-center justify-end text-center min-h-[38px]">
                                  <div className="flex-1 flex items-center justify-center mb-1">
                                    <div className="text-amber-700 font-bold border border-dashed border-amber-300 bg-amber-50/60 rounded px-2.5 py-0.5 uppercase tracking-wider text-[6.5px]">
                                      Aguardando Assinatura do Colaborador (Cópia será salva após devolução)
                                    </div>
                                  </div>

                                  <div className="border-t border-black w-full pt-1 font-bold text-[7px] uppercase truncate">
                                    ASSINATURA DO FUNCIONÁRIO • {selectedAdminEmployee.name}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      }

                      return (
                        <>
                          {/* ROW 1: COMPANY / CC / PERIOD */}
                          <div className="grid grid-cols-12 border-b border-black">
                            <div className="col-span-6 p-2 border-r border-black flex flex-col justify-between h-14">
                              <div className="font-extrabold text-[10px] leading-tight text-neutral-900 tracking-tight">
                                {company?.name || 'SENTINELA SERVIÇOS E TERCEIRIZAÇÕES LTDA'}
                              </div>
                              <div className="text-[7.5px] text-zinc-700 leading-none">
                                CNPJ: {company?.cnpj || '53.704.137/0001-93'}
                              </div>
                            </div>
                            <div className="col-span-3 p-2 border-r border-black flex flex-col justify-between text-center h-14">
                              <div className="font-bold text-[7.5px] text-zinc-900 leading-tight truncate px-0.5" title={(newSlipForm.postoName || findEmployeeServicePost(selectedAdminEmployee) || selectedAdminEmployee.postoName || 'MAESTRO LOCADORA DE').toUpperCase()}>
                                CC: {(newSlipForm.postoName || findEmployeeServicePost(selectedAdminEmployee) || selectedAdminEmployee.postoName || 'MAESTRO LOCADORA DE').toUpperCase()}
                              </div>
                              <div className="text-[7.5px] text-zinc-700 font-bold">
                                Mensalista
                              </div>
                            </div>
                            <div className="col-span-3 p-2 flex flex-col justify-between text-right h-14">
                              <div>
                                <div className="font-bold text-[7.5px] text-zinc-900 leading-none uppercase">
                                  Folha Mensal
                                </div>
                                <div className="text-[6.5px] font-bold text-amber-700 mt-0.5 tracking-tight">
                                  Pendente de Assinatura (Salvo após devolução)
                                </div>
                              </div>
                              <div className="font-extrabold text-[8.5px] text-black">
                                {months[Number(newSlipForm.month) - 1]?.toUpperCase()} de {newSlipForm.year}
                              </div>
                            </div>
                          </div>

                          {/* ROW 2: EMPLOYEE DETAILS BLOCK */}
                          <div className="grid grid-cols-12 border-b border-black bg-zinc-50/40">
                            <div className="col-span-1 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Cód.</span>
                              <span className="font-bold text-[8.5px] block text-center">52</span>
                            </div>
                            <div className="col-span-5 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Nome do Funcionário</span>
                              <div className="font-black text-[9px] uppercase leading-tight truncate text-neutral-950">{selectedAdminEmployee.name}</div>
                              <div className="text-[7px] text-zinc-650 font-bold uppercase mt-0.5 tracking-tight">{selectedAdminEmployee.department || 'VIGIA'}</div>
                            </div>
                            <div className="col-span-2 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">C.B.O.</span>
                              <span className="font-bold text-[8.5px] block text-center">{getCboByJob(selectedAdminEmployee.department)}</span>
                            </div>
                            <div className="col-span-1 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Depto</span>
                              <span className="font-bold text-[8.5px] block text-center">2</span>
                            </div>
                            <div className="col-span-1 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Filial</span>
                              <span className="font-bold text-[8.5px] block text-center">1</span>
                            </div>
                            <div className="col-span-2 p-1">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Admissão</span>
                              <span className="font-extrabold text-[8px] block text-center">
                                {selectedAdminEmployee.admissionDate
                                  ? (() => {
                                      const parts = selectedAdminEmployee.admissionDate.split('-');
                                      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : selectedAdminEmployee.admissionDate;
                                    })()
                                  : '20/02/2026'}
                              </span>
                            </div>
                          </div>

                          {/* ROW 3: TABLE FOR RUBRICS HEADER */}
                          <div className="grid grid-cols-12 bg-zinc-100 border-b border-black text-[7.5px] uppercase tracking-tight text-center font-bold p-0.5 py-1">
                            <div className="col-span-1 border-r border-black font-semibold">Código</div>
                            <div className="col-span-5 border-r border-black text-left pl-3 font-semibold">Descrição das Rubricas</div>
                            <div className="col-span-2 border-r border-black text-right pr-3 font-semibold">Referência</div>
                            <div className="col-span-2 border-r border-black text-right pr-3 font-semibold">Vencimentos</div>
                            <div className="col-span-2 text-right pr-3 font-semibold">Descontos</div>
                          </div>

                          {/* ROW 4: THE ITEMS MATRIX */}
                          <div className="text-[8px] min-h-[145px] bg-white relative flex flex-col justify-start">
                            {/* Columns background separators */}
                            <div className="absolute inset-0 grid grid-cols-12 pointer-events-none">
                              <div className="col-span-1 border-r border-zinc-250 h-full"></div>
                              <div className="col-span-5 border-r border-zinc-250 h-full"></div>
                              <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                              <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                              <div className="col-span-2 h-full"></div>
                            </div>

                            <div className="relative z-10">
                              {deduplicateSlipItems(newSlipItems).map((item, idx) => {
                                const isAdd = item.type === 'addition';
                                const isInfo = item.type === 'info' || item.code === '9382' || item.code === '9392';
                                return (
                                  <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950 hover:bg-blue-50/20" key={item.id || idx}>
                                    <div className="col-span-1 text-center font-bold text-zinc-700">{item.code || '---'}</div>
                                    <div className="col-span-5 uppercase pl-3 truncate font-medium">{item.description}</div>
                                    <div className="col-span-2 text-right text-zinc-800 pr-3">{item.reference || '-'}</div>
                                    <div className="col-span-2 text-right font-black pr-3">
                                      {isInfo ? <span className="text-zinc-300">-</span> : (isAdd ? formatNumber(item.amount) : <span className="text-zinc-300">-</span>)}
                                    </div>
                                    <div className="col-span-2 text-right font-black pr-3">
                                      {isInfo ? <span className="text-zinc-300">-</span> : (!isAdd ? <span className="text-red-650">{formatNumber(item.amount)}</span> : <span className="text-zinc-300">-</span>)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* ROW 5: TOTALS ROW */}
                          <div className="grid grid-cols-12 border-t border-black bg-zinc-50 font-sans font-bold text-[8px] py-1 text-neutral-800">
                            <div className="col-span-8 text-right pr-3 uppercase">Total de Vencimentos</div>
                            <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-neutral-900 pr-3">
                              {formatNumber(totalVencimentos)}
                            </div>
                            <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-red-600 pr-3">
                              {formatNumber(totalDescontos)}
                            </div>
                          </div>

                          {/* ROW 6: VALOR LÍQUIDO BOX */}
                          <div className="grid grid-cols-12 border-t border-black border-b bg-white items-center">
                            <div className="col-span-8 p-1 px-3 flex justify-between items-center bg-zinc-50/20">
                              <div className="text-[6.5px] uppercase font-black text-zinc-500 font-sans tracking-widest">Valor Líquido de Depósito</div>
                              <div className="text-[14px] font-sans font-bold text-zinc-950 mr-2 leading-none">⇨</div>
                            </div>
                            <div className="col-span-4 p-1.5 bg-zinc-100 font-mono text-right font-black text-[11px] text-zinc-950 pr-3 leading-none h-full flex items-center justify-end">
                              <span>{formatNumber(previewCalc.netSalary)}</span>
                            </div>
                          </div>

                          {/* ROW 7: REAL FOOTER CALCULATIONS STRIP (EXACT 6 CLT BASES) */}
                          <div className="grid grid-cols-12 text-[7px] text-center bg-zinc-50 uppercase divide-x divide-black h-8 leading-tight">
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Salário Base</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(previewCalc.baseSalary)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Sal. Contr. INSS</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(previewCalc.salContrInss)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Base Calc. FGTS</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(previewCalc.baseFgts)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">F.G.T.S do Mês</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(previewCalc.fgtsMes)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Base Calc. IRPF</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(previewCalc.baseIrrf)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Faixa IRPF</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{previewCalc.faixaIrrf}</span>
                            </div>
                          </div>

                          {/* SIGNATURE SECTION PREVIEW: SOMENTE COLABORADOR E DATA */}
                          <div className="pt-2 border-t border-black bg-white min-h-[70px] px-2.5 pb-1 flex flex-col justify-between">
                            <div className="text-[6px] text-zinc-600 font-sans leading-tight italic">
                              DECLARAÇÃO DE RECEBIMENTO: Reconheço que recebi a importância líquida discriminada neste recibo, correspondente à quitação das verbas remuneratórias do período indicado.
                            </div>

                            <div className="grid grid-cols-12 gap-3 items-end pt-1.5">
                              <div className="col-span-3 text-center border-t border-black pt-1">
                                <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Data da Assinatura</span>
                                <span className="font-extrabold text-[7.5px] font-mono block text-neutral-500">
                                  ____/____/________
                                </span>
                              </div>

                              <div className="col-span-9 flex flex-col items-center justify-end text-center min-h-[38px]">
                                <div className="flex-1 flex items-center justify-center mb-1">
                                  <div className="text-amber-700 font-bold border border-dashed border-amber-300 bg-amber-50/60 rounded px-2.5 py-0.5 uppercase tracking-wider text-[6.5px]">
                                    Aguardando Assinatura do Colaborador (Cópia será salva após devolução)
                                  </div>
                                </div>

                                <div className="border-t border-black w-full pt-1 font-bold text-[7px] uppercase truncate">
                                  ASSINATURA DO FUNCIONÁRIO • {selectedAdminEmployee.name}
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="bg-blue-50/55 border border-blue-100 rounded-2xl p-4 text-[10px] text-blue-900 flex gap-2 font-medium">
                    <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-blue-950">Ambiente de Segurança Ativo</p>
                      <p className="opacity-90 mt-0.5 leading-relaxed">O sistema garante validade jurídica total sob a MP 2.200-2, enviando ao colaborador para que ele assine diretamente pela interface web ou celular do app.</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Operations execute */}
              <button 
                onClick={handleCreateSlipSubmit}
                className="w-full mt-6 py-4 bg-slate-900 hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all cursor-pointer shadow-lg flex items-center justify-center gap-1.5"
              >
                <Send className="w-4 h-4 animate-bounce" style={{ animationDuration: '3s' }} />
                Despachar e Enviar Holerite
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CATALOGO DE RUBRICAS MODAL */}
      <AnimatePresence>
        {showRubricsCatalogModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/65 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 lg:p-8 max-w-2xl w-full border border-slate-100 shadow-2xl relative my-8"
            >
              <button 
                onClick={() => setShowRubricsCatalogModal(false)}
                className="absolute top-6 right-6 p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6 pr-8">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-blue-600" />
                  Catálogo Oficial de Rubricas & Códigos
                </h3>
                <p className="text-slate-500 text-xs mt-1">
                  Cadastre todos os códigos e descrições das rubricas da empresa. Eles ficarão salvos e disponíveis para qualquer geração de contra-cheque.
                </p>
              </div>

              {/* Form to add a new rubric to the catalog */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3 mb-6">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-blue-600" />
                  Cadastrar Novo Código & Descrição
                </h4>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-3">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Código *</label>
                    <input
                      type="text"
                      placeholder="Ex: 0180"
                      value={newRubricForm.code}
                      onChange={(e) => setNewRubricForm({ ...newRubricForm, code: e.target.value })}
                      className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 uppercase"
                    />
                  </div>
                  <div className="col-span-6">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Descrição Oficial *</label>
                    <input
                      type="text"
                      placeholder="Ex: COMISSÃO DE VENDAS"
                      value={newRubricForm.name}
                      onChange={(e) => setNewRubricForm({ ...newRubricForm, name: e.target.value })}
                      className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 uppercase"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Ref. Padrão</label>
                    <input
                      type="text"
                      placeholder="Ex: 5,00%"
                      value={newRubricForm.defaultReference}
                      onChange={(e) => setNewRubricForm({ ...newRubricForm, defaultReference: e.target.value })}
                      className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-4 text-xs font-bold">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="newRubricType"
                        checked={newRubricForm.type === 'addition'}
                        onChange={() => setNewRubricForm({ ...newRubricForm, type: 'addition' })}
                        className="text-blue-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="text-emerald-700">Vencimento (Provento +)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="newRubricType"
                        checked={newRubricForm.type === 'deduction'}
                        onChange={() => setNewRubricForm({ ...newRubricForm, type: 'deduction' })}
                        className="text-blue-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="text-red-650">Desconto (Dedução -)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="newRubricType"
                        checked={newRubricForm.type === 'info'}
                        onChange={() => setNewRubricForm({ ...newRubricForm, type: 'info' })}
                        className="text-blue-600 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="text-blue-700">Somente Referência (Informativa)</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveCustomRubric}
                    disabled={savingRubric}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm transition-all flex items-center gap-1.5"
                  >
                    {savingRubric ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Salvar Rubrica no Catálogo
                  </button>
                </div>
              </div>

              {/* Rubrics List & Search */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide">
                    Rubricas Cadastradas no Sistema ({allRubrics.length})
                  </h4>
                  <div className="relative w-48">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filtrar por código ou nome..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white">
                  {allRubrics
                    .filter(r => {
                      if (!catalogSearch.trim()) return true;
                      const s = catalogSearch.toUpperCase();
                      return r.code.includes(s) || r.name.toUpperCase().includes(s);
                    })
                    .map((r) => {
                      const isCustom = !r.isSystem;
                      return (
                        <div key={r.code} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-black text-xs px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-slate-800">
                              {r.code}
                            </span>
                            <div>
                              <p className="font-bold text-xs text-slate-900 leading-tight">{r.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={cn(
                                  "text-[8px] font-black uppercase px-1.5 py-0.2 rounded",
                                  r.type === 'addition' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                )}>
                                  {r.type === 'addition' ? 'Vencimento' : 'Desconto'}
                                </span>
                                {r.defaultReference && (
                                  <span className="text-[9px] text-slate-400">Ref: {r.defaultReference}</span>
                                )}
                                {isCustom ? (
                                  <span className="text-[8px] font-bold text-blue-600 bg-blue-50 px-1 rounded">Personalizada</span>
                                ) : (
                                  <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1 rounded">Padrão CLT</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectCatalogRubric(`${r.code}:::${r.type}`);
                                setShowRubricsCatalogModal(false);
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Inserir no Holerite
                            </button>
                            {isCustom && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomRubric(r.id)}
                                className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                                title="Excluir do catálogo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden; }
          #payslip-print-block, #payslip-print-block * { visibility: visible; }
          #payslip-print-block { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            margin: 0 !important;
            padding: 0 !important;
            width: 190mm !important;
            height: auto !important;
            box-sizing: border-box !important;
            border: none !important;
            box-shadow: none !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />
    </div>
  );
}
