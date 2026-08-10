const { useState, useEffect, useRef } = React;

// --- KONFIGURASI FIREBASE CLOUD DATABASE ---
const firebaseConfig = {
  apiKey: "AIzaSyA6uaq7loBCTb3nxXyLGw78JLVyNoMeylo",
  authDomain: "pencatatan-bengkel-digital.firebaseapp.com",
  projectId: "pencatatan-bengkel-digital",
  storageBucket: "pencatatan-bengkel-digital.firebasestorage.app",
  messagingSenderId: "818562667866",
  appId: "1:818562667866:web:a98e14e60eaf304f9c4f63",
  measurementId: "G-XX6M48LTZL"
};

// Inisialisasi Firebase & Firestore Database
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

function App() {
  // Auth State: 'karyawan' | 'stok_admin' | 'full_admin'
  const [userRole, setUserRole] = useState('karyawan');
  const [currentUsername, setCurrentUsername] = useState(''); // Menyimpan nama akun yang login

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });

  // Cloud Database Data States
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]); // State untuk data pengeluaran
  const [loading, setLoading] = useState(true);

  // Navigation State
  const [activeTab, setActiveTab] = useState('kasir'); // 'kasir' | 'stok' | 'input_barang' | 'laporan' | 'pengeluaran'

  // Cart State (Kasir)
  const [cart, setCart] = useState([]);
  const [serviceFee, setServiceFee] = useState('');
  const [serviceNote, setServiceNote] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Expense Form State
  const [newExpense, setNewExpense] = useState({ title: '', amount: '', note: '' });

  // Toast / Notification Banner State
  const [toastMessage, setToastMessage] = useState('');

  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [scanTarget, setScanTarget] = useState(null); // 'kasir' | 'admin_input'
  const html5QrCodeRef = useRef(null);

  // Admin New Product State
  const [newProduct, setNewProduct] = useState({
    barcode: '',
    name: '',
    buyPrice: '',
    price: '',
    stock: ''
  });

  // Flag untuk mendeteksi apakah barang sudah ada (untuk pembatasan Rahmat & Sabila)
  const [isExistingProductLocked, setIsExistingProductLocked] = useState(false);

  // Admin Edit Product State
  const [editingProductId, setEditingProductId] = useState(null);
  const [editProductData, setEditProductData] = useState({
    name: '',
    buyPrice: '',
    price: '',
    stock: ''
  });

  // Laporan Filter States
  const [reportFilterType, setReportFilterType] = useState('hari'); // 'hari' | 'minggu' | 'bulan' | 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Bluetooth Device
  const [btDevice, setBtDevice] = useState(null);

  // Helper Notifikasi Pop-up (Toast)
  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 4000);
  };

  // --- SINKRONISASI DATA REALTIME DARI FIREBASE CLOUD ---
  useEffect(() => {
    const unsubscribeProducts = db.collection('products').onSnapshot(snapshot => {
      const productList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(productList);
      setLoading(false);
    }, err => {
      console.error("Gagal ambil produk:", err);
      setLoading(false);
    });

    const unsubscribeTransactions = db.collection('transactions')
      .orderBy('date', 'desc')
      .onSnapshot(snapshot => {
        const trxList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTransactions(trxList);
      }, err => console.error("Gagal ambil transaksi:", err));

    // Sinkronisasi Realtime Data Pengeluaran (Expenses)
    const unsubscribeExpenses = db.collection('expenses')
      .orderBy('date', 'desc')
      .onSnapshot(snapshot => {
        const expList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setExpenses(expList);
      }, err => console.error("Gagal ambil pengeluaran:", err));

    return () => {
      unsubscribeProducts();
      unsubscribeTransactions();
      unsubscribeExpenses();
    };
  }, []);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  // Scanner Logic
  const startScanner = (target) => {
    setScanTarget(target);
    setIsScanning(true);
    setTimeout(() => {
      const html5QrCode = new Html5Qrcode("reader");
      html5QrCodeRef.current = html5QrCode;
      
      const config = { 
        fps: 10, 
        qrbox: { width: 300, height: 150 }, 
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A
        ]
      };

      html5QrCode.start(
        { facingMode: "environment" }, 
        config,
        (decodedText) => {
          handleScanSuccess(decodedText, target);
          stopScanner();
        },
        (errorMessage) => {}
      ).catch(err => {
        alert("Gagal membuka kamera: " + err);
        setIsScanning(false);
      });
    }, 300);
  };

  const stopScanner = () => {
    if (html5QrCodeRef.current) {
      html5QrCodeRef.current.stop().then(() => {
        html5QrCodeRef.current.clear();
      }).catch(err => {
        console.error("Failed to clear html5QrCode", err);
      });
    }
    setIsScanning(false);
  };

  // --- HANDLE SCAN SUCCESS ---
  const handleScanSuccess = (decodedText, target) => {
    if (target === 'admin_input') {
      handleRestockInputChange('barcode', decodedText);
      triggerToast("✅ Barcode berhasil terbaca: " + decodedText);
    } else if (target === 'kasir') {
      const foundProduct = products.find(p => p.barcode === decodedText);
      if (foundProduct) {
        addToCart(foundProduct);
      } else {
        setSearchQuery(decodedText);
        triggerToast("⚠️ Barcode tidak ditemukan, dicari pada daftar barang.");
      }
    }
  };

  // Cart Logic
  const addToCart = (product) => {
    if (product.stock <= 0) {
      alert("Stok barang habis!");
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) {
          alert("Jumlah melebihi stok yang tersedia!");
          return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    triggerToast("✨ Barang '" + product.name + "' ditambahkan ke keranjang!");
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        const product = products.find(p => p.id === id);
        if (newQty > product.stock) {
          alert("Stok tidak mencukupi!");
          return item;
        }
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const itemsTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const grandTotal = itemsTotal + Number(serviceFee || 0);
  const change = Number(payAmount || 0) - grandTotal;

  // RESET FORM
  const resetKasirForm = () => {
    setCart([]);
    setServiceFee('');
    setServiceNote('');
    setPayAmount('');
    setSearchQuery('');
  };

  const resetRestockForm = () => {
    setNewProduct({
      barcode: '',
      name: '',
      buyPrice: '',
      price: '',
      stock: ''
    });
    setIsExistingProductLocked(false);
  };

  // --- LOGIN ADMIN HANDLER BERDASARKAN USERNAME & PASSWORD ---
  const handleAdminLogin = (e) => {
    e.preventDefault();
    const { username, password } = loginForm;

    if (username === 'ekarmdni027' && password === 'cekidott') {
      setIsAdminLoggedIn(true);
      setUserRole('full_admin');
      setCurrentUsername('ekarmdni027');
      setLoginForm({ username: '', password: '' });
      triggerToast("🔓 Berhasil masuk sebagai Full Admin");
    } else if (
      (username.toUpperCase() === 'RAHMAT' && password === 'RAHMAT') || 
      (username.toUpperCase() === 'SABILA' && password === 'SABILA')
    ) {
      setIsAdminLoggedIn(true);
      setUserRole('stok_admin');
      setCurrentUsername(username.toUpperCase());
      setLoginForm({ username: '', password: '' });
      triggerToast("🔓 Berhasil masuk sebagai Admin Stok (" + username.toUpperCase() + ")");
    } else {
      alert("Username atau Password salah!");
    }
  };

  // --- HANDLE CHECKOUT ---
  const handleCheckout = async () => {
    if (cart.length === 0 && Number(serviceFee || 0) === 0) {
      alert("Keranjang & Jasa masih kosong! Pilih barang atau masukkan biaya jasa terlebih dahulu.");
      return;
    }
    if (Number(payAmount || 0) < grandTotal) {
      alert("Uang pembayaran kurang! Masukkan nominal yang cukup.");
      return;
    }

    const currentCart = [...cart];
    const currentServiceFee = Number(serviceFee || 0);
    const currentServiceNote = serviceNote;
    const currentGrandTotal = grandTotal;
    const currentPayAmount = Number(payAmount || 0);
    const currentChange = change;

    resetKasirForm();
    triggerToast("⚡ Transaksi sedang diproses & Sudah selesai!");

    try {
      const batch = db.batch();

      currentCart.forEach(item => {
        const productRef = db.collection('products').doc(item.id);
        const currentProduct = products.find(p => p.id === item.id);
        if (currentProduct) {
          batch.update(productRef, {
            stock: currentProduct.stock - item.qty
          });
        }
      });

      const newTrxId = 'TRX-' + Date.now();
      const trxRef = db.collection('transactions').doc(newTrxId);
      const newTransaction = {
        id: newTrxId,
        date: new Date().toISOString(),
        items: currentCart,
        serviceFee: currentServiceFee,
        serviceNote: currentServiceNote,
        total: currentGrandTotal,
        payAmount: currentPayAmount,
        change: currentChange,
        cashier: userRole
      };

      batch.set(trxRef, newTransaction);
      await batch.commit();

      printBluetoothReceipt(newTransaction);

    } catch (error) {
      alert("Gagal menyimpan transaksi ke Cloud: " + error.message);
    }
  };

  // --- HANDLE DELETE TRANSACTION (FULL ADMIN ONLY) ---
  const handleDeleteTransaction = async (id) => {
    if (confirm(`Apakah Anda yakin ingin menghapus riwayat transaksi ${id}?`)) {
      try {
        await db.collection('transactions').doc(id).delete();
        triggerToast("🗑️ Riwayat transaksi berhasil dihapus!");
      } catch (error) {
        alert("Gagal menghapus transaksi: " + error.message);
      }
    }
  };

  // --- HANDLE SAVE EXPENSE (PENGELUARAN) ---
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.title || !newExpense.amount) {
      alert("Judul pengeluaran dan nominal wajib diisi!");
      return;
    }

    try {
      const expenseData = {
        title: newExpense.title,
        amount: Number(newExpense.amount),
        note: newExpense.note || '-',
        date: new Date().toISOString(),
        inputBy: userRole
      };

      await db.collection('expenses').add(expenseData);
      setNewExpense({ title: '', amount: '', note: '' });
      triggerToast("✅ Pengeluaran berhasil disimpan ke Database!");
    } catch (error) {
      alert("Gagal menyimpan pengeluaran: " + error.message);
    }
  };

  // --- HANDLE DELETE EXPENSE (FULL ADMIN ONLY) ---
  const handleDeleteExpense = async (id) => {
    if (confirm("Apakah Anda yakin ingin menghapus data pengeluaran ini?")) {
      try {
        await db.collection('expenses').doc(id).delete();
        triggerToast("🗑️ Pengeluaran berhasil dihapus!");
      } catch (error) {
        alert("Gagal menghapus pengeluaran: " + error.message);
      }
    }
  };

  // Bluetooth Printing Logic (ESC/POS)
  const printBluetoothReceipt = async (trx) => {
    try {
      let device = btDevice;
      if (!device) {
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['00001101-0000-1000-8000-00805f9b34fb', '000018f0-0000-1000-8000-00805f9b34fb']
        });
        setBtDevice(device);
      }

      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      if (services.length === 0) throw new Error("Layanan Bluetooth tidak ditemukan.");
      
      const characteristics = await services[0].getCharacteristics();
      const writeCharacteristic = characteristics[0];

      let text = "\x1B\x40";
      text += "\x1B\x61\x01";
      text += "BENGKEL MOTOR\n";
      text += "--------------------------------\n";
      text += `No: ${trx.id}\n`;
      text += `Tgl: ${new Date(trx.date).toLocaleString('id-ID')}\n`;
      text += "--------------------------------\n";
      text += "\x1B\x61\x00";

      if (trx.items && trx.items.length > 0) {
        trx.items.forEach(item => {
          text += `${item.name}\n`;
          text += `${item.qty} x ${item.price.toLocaleString()} = ${(item.qty * item.price).toLocaleString()}\n`;
        });
      }

      if (trx.serviceFee > 0) {
        text += `Jasa: ${trx.serviceNote || 'Servis'}\n`;
        text += `1 x ${trx.serviceFee.toLocaleString()} = ${trx.serviceFee.toLocaleString()}\n`;
      }

      text += "--------------------------------\n";
      text += `TOTAL    : Rp ${trx.total.toLocaleString()}\n`;
      text += `BAYAR    : Rp ${trx.payAmount.toLocaleString()}\n`;
      text += `KEMBALI  : Rp ${trx.change.toLocaleString()}\n`;
      text += "--------------------------------\n";
      text += "\x1B\x61\x01";
      text += "Terima Kasih!\n\n\n\n";

      const encoder = new TextEncoder();
      await writeCharacteristic.writeValue(encoder.encode(text));
    } catch (error) {
      console.log("Status cetak bluetooth:", error.message);
    }
  };

  // --- AUTOFILL PADA RESTOCK DENGAN PEMBATASAN UNTUK RAHMAT & SABILA ---
  const handleRestockInputChange = (field, value) => {
    if (field === 'barcode') {
      const found = products.find(p => p.barcode === value);
      if (found) {
        setNewProduct({
          barcode: value,
          name: found.name,
          buyPrice: found.buyPrice || '',
          price: found.price || '',
          stock: ''
        });
        if (userRole === 'stok_admin') {
          setIsExistingProductLocked(true);
          triggerToast("🔒 Barang sudah terdaftar! Nama & Harga dikunci. Anda hanya bisa menambah stok.");
        } else {
          triggerToast("✨ Barcode sama terdeteksi!");
        }
      } else {
        setNewProduct(prev => ({ ...prev, barcode: value }));
        if (userRole === 'stok_admin') {
          setIsExistingProductLocked(false);
        }
      }
    } else if (field === 'name') {
      const found = products.find(p => p.name.toLowerCase() === value.toLowerCase());
      if (found) {
        setNewProduct({
          barcode: found.barcode || '',
          name: value,
          buyPrice: found.buyPrice || '',
          price: found.price || '',
          stock: ''
        });
        if (userRole === 'stok_admin') {
          setIsExistingProductLocked(true);
          triggerToast("🔒 Barang sudah terdaftar! Nama & Harga dikunci. Anda hanya bisa menambah stok.");
        } else {
          triggerToast("✨ Nama barang sama terdeteksi! Barcode & Harga otomatis terisi.");
        }
      } else {
        setNewProduct(prev => ({ ...prev, name: value }));
        if (userRole === 'stok_admin') {
          setIsExistingProductLocked(false);
        }
      }
    } else {
      setNewProduct(prev => ({ ...prev, [field]: value }));
    }
  };

  // --- HANDLE SAVE PRODUCT (FULL ADMIN & STOK ADMIN) ---
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.barcode || !newProduct.name || !newProduct.price || !newProduct.stock) {
      alert("Lengkapi data barang terlebih dahulu!");
      return;
    }

    // Validasi pembatasan stok masuk hanya boleh angka positif (1, 2, 3, dst.) untuk akun RAHMAT & SABILA
    if (userRole === 'stok_admin' && Number(newProduct.stock) <= 0) {
      alert("Gagal menginput! Jumlah Stok Masuk hanya boleh angka positif (1, 2, 3, dan seterusnya).");
      return;
    }

    const targetProductData = { ...newProduct };
    resetRestockForm();
    triggerToast("⚡ Data diproses & Form Restock di-reset kosong!");

    try {
      const existingProduct = products.find(p => p.barcode === targetProductData.barcode);

      if (existingProduct) {
        // Jika akun stok_admin (Rahmat/Sabila), pastikan harga/nama tidak berubah meskipun dimanipulasi
        const updatePayload = userRole === 'stok_admin' ? {
          stock: existingProduct.stock + Number(targetProductData.stock)
        } : {
          name: targetProductData.name,
          buyPrice: Number(targetProductData.buyPrice),
          price: Number(targetProductData.price),
          stock: existingProduct.stock + Number(targetProductData.stock)
        };

        await db.collection('products').doc(existingProduct.id).update(updatePayload);
      } else {
        // Barang baru bebas diinput oleh siapa pun yang memiliki akses restock
        await db.collection('products').add({
          barcode: targetProductData.barcode,
          name: targetProductData.name,
          buyPrice: Number(targetProductData.buyPrice),
          price: Number(targetProductData.price),
          stock: Number(targetProductData.stock)
        });
      }

      triggerToast("✅ SUKSES! Stok berhasil ditambahkan ke Database.");

    } catch (error) {
      alert("Gagal menyimpan data ke Cloud: " + error.message);
    }
  };

  const handleStartEdit = (product) => {
    setEditingProductId(product.id);
    setEditProductData({
      name: product.name,
      buyPrice: product.buyPrice || '',
      price: product.price,
      stock: product.stock
    });
  };

  const handleCancelEdit = () => {
    setEditingProductId(null);
    setEditProductData({ name: '', buyPrice: '', price: '', stock: '' });
  };

  const handleSaveEdit = async (id) => {
    try {
      await db.collection('products').doc(id).update({
        name: editProductData.name,
        buyPrice: Number(editProductData.buyPrice || 0),
        price: Number(editProductData.price || 0),
        stock: Number(editProductData.stock || 0)
      });
      setEditingProductId(null);
      triggerToast("✏️ Data barang berhasil diperbarui!");
    } catch (error) {
      alert("Gagal memperbarui barang: " + error.message);
    }
  };

  const handleDeleteProduct = async (id, name) => {
    if (confirm(`Apakah Anda yakin ingin menghapus barang "${name}"?`)) {
      try {
        await db.collection('products').doc(id).delete();
        triggerToast("🗑️ Barang '" + name + "' telah dihapus!");
      } catch (error) {
        alert("Gagal menghapus barang: " + error.message);
      }
    }
  };

  // --- FILTER LAPORAN KEUANGAN ---
  const filteredTransactions = transactions.filter(t => {
    const trxDate = new Date(t.date);
    const today = new Date();

    if (reportFilterType === 'hari') {
      return trxDate.toDateString() === today.toDateString();
    } else if (reportFilterType === 'minggu') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);
      return trxDate >= sevenDaysAgo && trxDate <= today;
    } else if (reportFilterType === 'bulan') {
      return trxDate.getMonth() === today.getMonth() && trxDate.getFullYear() === today.getFullYear();
    } else if (reportFilterType === 'custom') {
      if (!customStartDate || !customEndDate) return true;
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      return trxDate >= start && trxDate <= end;
    }
    return true;
  });

  const filteredExpenses = expenses.filter(e => {
    const expDate = new Date(e.date);
    const today = new Date();

    if (reportFilterType === 'hari') {
      return expDate.toDateString() === today.toDateString();
    } else if (reportFilterType === 'minggu') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);
      return expDate >= sevenDaysAgo && expDate <= today;
    } else if (reportFilterType === 'bulan') {
      return expDate.getMonth() === today.getMonth() && expDate.getFullYear() === today.getFullYear();
    } else if (reportFilterType === 'custom') {
      if (!customStartDate || !customEndDate) return true;
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);
      return expDate >= start && expDate <= end;
    }
    return true;
  });

  const totalOmset = filteredTransactions.reduce((acc, t) => acc + t.total, 0);
  const totalJasa = filteredTransactions.reduce((acc, t) => acc + t.serviceFee, 0);
  const totalPengeluaran = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
  
  const totalModalBarang = filteredTransactions.reduce((acc, t) => {
    const itemModal = (t.items || []).reduce((iAcc, item) => iAcc + ((item.buyPrice || 0) * item.qty), 0);
    return acc + itemModal;
  }, 0);

  const totalLabaBersih = (totalOmset - totalModalBarang) - totalPengeluaran;

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.barcode.includes(searchQuery)
  );

  // --- DOWNLOAD PDF REPORT ---
  const downloadPDFReport = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("LAPORAN KEUANGAN BENGKEL MOTOR", 14, 15);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    let periodeText = "Periode: ";
    if (reportFilterType === 'hari') periodeText += "Hari Ini";
    else if (reportFilterType === 'minggu') periodeText += "7 Hari Terakhir";
    else if (reportFilterType === 'bulan') periodeText += "Bulan Ini";
    else if (reportFilterType === 'custom') periodeText += `${customStartDate || 'Awal'} s/d ${customEndDate || 'Akhir'}`;
    
    doc.text(periodeText, 14, 22);
    doc.text(`Dicetak Pada: ${new Date().toLocaleString('id-ID')}`, 14, 28);

    doc.setFont("helvetica", "bold");
    doc.text("Ringkasan Eksekutif:", 14, 38);
    
    const summaryData = [
      ["Total Omset Penjualan", `Rp ${totalOmset.toLocaleString()}`],
      ["Total Pendapatan Jasa", `Rp ${totalJasa.toLocaleString()}`],
      ["Total Pengeluaran", `Rp ${totalPengeluaran.toLocaleString()}`],
      ["Estimasi Laba Bersih", `Rp ${totalLabaBersih.toLocaleString()}`]
    ];

    doc.autoTable({
      startY: 42,
      head: [['Keterangan', 'Jumlah']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 9 }
    });

    let currentY = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.text("Rincian Transaksi:", 14, currentY);

    const trxTableData = filteredTransactions.map((t, index) => [
      index + 1,
      t.id,
      new Date(t.date).toLocaleDateString('id-ID'),
      (t.items || []).map(i => `${i.name} (${i.qty}x)`).join(', ') + (t.serviceFee > 0 ? ` + Jasa: ${t.serviceNote || 'Servis'}` : ''),
      `Rp ${t.total.toLocaleString()}`
    ]);

    doc.autoTable({
      startY: currentY + 4,
      head: [['No', 'ID Trx', 'Tanggal', 'Detail Item / Jasa', 'Total']],
      body: trxTableData.length > 0 ? trxTableData : [[{ content: 'Tidak ada transaksi pada periode ini', colSpan: 5, styles: { halign: 'center' } }]],
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
      styles: { fontSize: 8 }
    });

    currentY = doc.lastAutoTable.finalY + 10;

    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.text("Rincian Pengeluaran:", 14, currentY);

    const expTableData = filteredExpenses.map((e, index) => [
      index + 1,
      e.title,
      new Date(e.date).toLocaleDateString('id-ID'),
      e.note || '-',
      `Rp ${e.amount.toLocaleString()}`
    ]);

    doc.autoTable({
      startY: currentY + 4,
      head: [['No', 'Keperluan', 'Tanggal', 'Catatan', 'Nominal']],
      body: expTableData.length > 0 ? expTableData : [[{ content: 'Tidak ada pengeluaran pada periode ini', colSpan: 5, styles: { halign: 'center' } }]],
      theme: 'striped',
      headStyles: { fillColor: [192, 57, 43] },
      styles: { fontSize: 8 }
    });

    doc.save(`Laporan-Keuangan-${reportFilterType}-${Date.now()}.pdf`);
    triggerToast("📄 Laporan Keuangan berhasil diunduh dalam format PDF!");
  };

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0 bg-slate-100">
      {/* Top Header */}
      <header className="bg-slate-800 text-white p-4 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <i data-lucide="wrench" className="w-6 h-6 text-yellow-400"></i>
          <h1 className="font-bold text-lg">POS Bengkel Motor</h1>
        </div>
        
        {/* Role Switcher / Status */}
        <div className="flex items-center bg-slate-700 rounded-lg p-1">
          {userRole !== 'karyawan' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-1 text-yellow-400">
                {userRole === 'full_admin' ? 'Full Admin' : `Admin Stok (${currentUsername})`}
              </span>
              <button 
                onClick={() => { setIsAdminLoggedIn(false); setUserRole('karyawan'); setCurrentUsername(''); setActiveTab('kasir'); }} 
                className="px-3 py-1 rounded-md text-xs font-semibold transition bg-red-600 text-white">
                Logout
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsAdminLoggedIn('prompt')} 
              className="px-3 py-1 rounded-md text-xs font-semibold transition text-gray-300 hover:text-white">
              Login Admin
            </button>
          )}
        </div>
      </header>

      {/* Modal Prompt Login Admin */}
      {isAdminLoggedIn === 'prompt' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <form onSubmit={handleAdminLogin} className="bg-white p-6 rounded shadow w-full max-w-sm space-y-3">
            <h2 className="font-bold text-gray-800">Verifikasi Login Admin</h2>
            <input 
              type="text" 
              placeholder="Username" 
              className="w-full border p-2 text-sm rounded" 
              value={loginForm.username}
              onChange={e => setLoginForm({...loginForm, username: e.target.value})} 
              required
            />
            <input 
              type="password" 
              placeholder="Password" 
              className="w-full border p-2 text-sm rounded" 
              value={loginForm.password}
              onChange={e => setLoginForm({...loginForm, password: e.target.value})} 
              required
            />
            <button className="w-full bg-blue-600 text-white p-2 rounded text-sm font-bold">Masuk</button>
            <button 
              type="button" 
              onClick={() => setIsAdminLoggedIn(false)} 
              className="w-full text-gray-500 text-sm">
              Batal
            </button>
          </form>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="bg-white border-b flex flex-wrap justify-around p-2 text-xs md:text-sm font-medium text-gray-600 shadow-sm sticky top-0 z-10 gap-1">
        <button 
          onClick={() => setActiveTab('kasir')} 
          className={`flex items-center gap-1 py-1.5 px-3 rounded-lg transition ${activeTab === 'kasir' ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200' : ''}`}>
          <i data-lucide="shopping-cart" className="w-4 h-4"></i> Kasir
        </button>
        <button 
          onClick={() => setActiveTab('stok')} 
          className={`flex items-center gap-1 py-1.5 px-3 rounded-lg transition ${activeTab === 'stok' ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200' : ''}`}>
          <i data-lucide="boxes" className="w-4 h-4"></i> Lihat Stok
        </button>
        <button 
          onClick={() => setActiveTab('pengeluaran')} 
          className={`flex items-center gap-1 py-1.5 px-3 rounded-lg transition ${activeTab === 'pengeluaran' ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200' : ''}`}>
          <i data-lucide="wallet" className="w-4 h-4"></i> Pengeluaran
        </button>
        <button 
          onClick={() => setActiveTab('laporan')} 
          className={`flex items-center gap-1 py-1.5 px-3 rounded-lg transition ${activeTab === 'laporan' ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200' : ''}`}>
          <i data-lucide="file-text" className="w-4 h-4"></i> Laporan Keuangan
        </button>
        
        {/* Tombol Restock hanya untuk Full Admin & Admin Stok */}
        {(userRole === 'full_admin' || userRole === 'stok_admin') && (
          <button 
            onClick={() => setActiveTab('input_barang')} 
            className={`flex items-center gap-1 py-1.5 px-3 rounded-lg transition ${activeTab === 'input_barang' ? 'bg-blue-50 text-blue-600 font-bold border border-blue-200' : ''}`}>
            <i data-lucide="plus-circle" className="w-4 h-4"></i> Restock/Input
          </button>
        )}
      </nav>

      {/* VISUAL POPUP NOTIFIKASI */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 w-11/12 max-w-md">
          <div className="bg-emerald-600 text-white font-bold text-xs md:text-sm px-4 py-3 rounded-xl shadow-2xl border-2 border-white flex items-center justify-between gap-2 animate-bounce">
            <div className="flex items-center gap-2">
              <i data-lucide="check-circle" className="w-5 h-5 text-yellow-300 shrink-0"></i>
              <span>{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage('')} className="text-white hover:text-gray-200 font-extrabold text-sm">✕</button>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="bg-yellow-100 border-b border-yellow-200 text-yellow-800 text-xs px-4 py-2 text-center font-bold">
          Sedang menghubungkan & menyelaraskan ke Cloud Database...
        </div>
      )}

      {/* Scanner Modal Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-4 rounded-xl w-full max-w-sm text-center">
            <h3 className="font-bold text-gray-800 mb-2">Arahkan Kamera ke Barcode</h3>
            <div id="reader" className="w-full h-64 bg-black rounded-lg overflow-hidden"></div>
            <button 
              onClick={stopScanner}
              className="mt-4 w-full bg-red-600 text-white py-2 rounded-lg font-bold">
              Batal Scan
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">

        {/* TAB: KASIR */}
        {activeTab === 'kasir' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border">
              <h2 className="font-bold text-gray-800 mb-3 flex items-center justify-between">
                <span>Cari / Scan Barang</span>
                <button 
                  onClick={() => startScanner('kasir')} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-semibold transition">
                  <i data-lucide="camera" className="w-4 h-4"></i> Scan Barcode
                </button>
              </h2>

              <input 
                type="text" 
                placeholder="Ketik nama barang atau scan barcode..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border rounded-lg p-2 text-sm mb-3 focus:outline-blue-500 bg-gray-50"
              />

              <div className="max-h-64 overflow-y-auto divide-y">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">Tidak ada barang / Belum ada barang di Database</p>
                ) : (
                  filteredProducts.map(p => (
                    <div key={p.id} className="py-2.5 flex justify-between items-center text-sm hover:bg-slate-50 px-1 rounded transition">
                      <div>
                        <p className="font-semibold text-gray-800">{p.name}</p>
                        <p className="text-xs text-gray-500">
                          Rp {p.price.toLocaleString()} | Stok: <span className={p.stock < 5 ? "text-red-500 font-bold" : "text-green-600 font-bold"}>{p.stock} Pcs</span>
                        </p>
                      </div>
                      <button 
                        onClick={() => addToCart(p)}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 active:scale-95 transition">
                        + Pilih
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-bold text-gray-800 flex items-center gap-1">
                    <i data-lucide="shopping-bag" className="w-4 h-4 text-blue-600"></i> Detail Transaksi
                  </h2>
                  {(cart.length > 0 || serviceFee || payAmount) && (
                    <button 
                      onClick={resetKasirForm}
                      className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 bg-red-50 px-2 py-1 rounded">
                      <i data-lucide="rotate-ccw" className="w-3 h-3"></i> Bersihkan
                    </button>
                  )}
                </div>

                <div className="max-h-44 overflow-y-auto divide-y mb-3 bg-gray-50 p-2 rounded-lg border">
                  {cart.length === 0 ? (
                    <p className="text-xs text-gray-400 py-6 text-center">Belum ada barang dimasukkan ke keranjang</p>
                  ) : (
                    cart.map(item => (
                      <div key={item.id} className="py-2 flex justify-between items-center text-sm">
                        <div className="flex-1 pr-2">
                          <p className="font-semibold text-gray-800 text-xs">{item.name}</p>
                          <p className="text-[11px] text-gray-500">Rp {item.price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateQty(item.id, -1)} className="bg-white border shadow-sm px-2 py-0.5 rounded font-bold text-xs">-</button>
                          <span className="text-xs font-bold w-5 text-center">{item.qty}</span>
                          <button onClick={() => updateQty(item.id, 1)} className="bg-white border shadow-sm px-2 py-0.5 rounded font-bold text-xs">+</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border mb-3">
                  <label className="text-xs font-bold text-gray-700 block mb-1">Input Biaya Jasa Servis (Manual)</label>
                  <input 
                    type="text" 
                    placeholder="Keterangan Jasa (Contoh: Ganti Ban / Tune Up)" 
                    value={serviceNote}
                    onChange={(e) => setServiceNote(e.target.value)}
                    className="w-full border rounded p-1.5 text-xs mb-2 bg-white"
                  />
                  <input 
                    type="number" 
                    placeholder="Biaya Jasa (Rp)" 
                    value={serviceFee}
                    onChange={(e) => setServiceFee(e.target.value)}
                    className="w-full border rounded p-1.5 text-xs font-bold text-blue-600 bg-white"
                  />
                </div>

                <div className="space-y-1.5 text-sm border-t pt-2">
                  <div className="flex justify-between font-bold text-gray-800 text-base">
                    <span>Total Keseluruhan:</span>
                    <span className="text-blue-600 font-extrabold">Rp {grandTotal.toLocaleString()}</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block">Uang Dibayar Pembeli (Rp):</label>
                    <input 
                      type="number" 
                      placeholder="Masukkan nominal uang..." 
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full border rounded p-2 text-sm font-bold text-green-700 bg-white focus:outline-green-500"
                    />
                  </div>
                  {Number(payAmount) > 0 && (
                    <div className="flex justify-between text-xs font-bold pt-1">
                      <span>Uang Kembalian:</span>
                      <span className={change < 0 ? "text-red-500" : "text-gray-800"}>
                        Rp {change.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <button 
                onClick={handleCheckout}
                className="mt-4 w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 shadow-md transition active:scale-98">
                Selesaikan Transaksi & Cetak
              </button>
            </div>
          </div>
        )}

        {/* TAB: STOK BARANG */}
        {activeTab === 'stok' && (
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-gray-800">Daftar Stok Barang Cloud</h2>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-bold">Total: {products.length} Barang</span>
            </div>

            <input 
              type="text" 
              placeholder="Cari nama barang atau barcode..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm mb-4 bg-gray-50"
            />

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-600">
                <thead className="bg-gray-100 uppercase text-gray-700 font-bold">
                  <tr>
                    <th className="p-2.5">Barcode</th>
                    <th className="p-2.5">Nama Barang</th>
                    <th className="p-2.5">Harga Modal</th>
                    <th className="p-2.5">Harga Jual</th>
                    <th className="p-2.5">Sisa Stok</th>
                    {userRole === 'full_admin' && <th className="p-2.5 text-center">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProducts.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono text-gray-500">{p.barcode}</td>
                      
                      {editingProductId === p.id && userRole === 'full_admin' ? (
                        <>
                          <td className="p-2.5">
                            <input 
                              type="text" 
                              value={editProductData.name} 
                              onChange={(e) => setEditProductData({ ...editProductData, name: e.target.value })}
                              className="border rounded p-1 w-full text-xs"
                            />
                          </td>
                          <td className="p-2.5">
                            <input 
                              type="number" 
                              value={editProductData.buyPrice} 
                              onChange={(e) => setEditProductData({ ...editProductData, buyPrice: e.target.value })}
                              className="border rounded p-1 w-20 text-xs"
                            />
                          </td>
                          <td className="p-2.5">
                            <input 
                              type="number" 
                              value={editProductData.price} 
                              onChange={(e) => setEditProductData({ ...editProductData, price: e.target.value })}
                              className="border rounded p-1 w-20 text-xs"
                            />
                          </td>
                          <td className="p-2.5">
                            <input 
                              type="number" 
                              value={editProductData.stock} 
                              onChange={(e) => setEditProductData({ ...editProductData, stock: e.target.value })}
                              className="border rounded p-1 w-16 text-xs"
                            />
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex justify-center gap-1">
                              <button onClick={() => handleSaveEdit(p.id)} className="bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold">Simpan</button>
                              <button onClick={handleCancelEdit} className="bg-gray-400 text-white px-2 py-1 rounded text-[10px]">Batal</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2.5 font-semibold text-gray-800">{p.name}</td>
                          <td className="p-2.5 text-gray-500">Rp {(p.buyPrice || 0).toLocaleString()}</td>
                          <td className="p-2.5 font-bold">Rp {p.price.toLocaleString()}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${p.stock < 5 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                              {p.stock} Pcs
                            </span>
                          </td>
                          {userRole === 'full_admin' && (
                            <td className="p-2.5 text-center">
                              <div className="flex justify-center gap-1">
                                <button onClick={() => handleStartEdit(p)} className="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded text-[10px] font-bold">Edit</button>
                                <button onClick={() => handleDeleteProduct(p.id, p.name)} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-[10px] font-bold">Hapus</button>
                              </div>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: PENGELUARAN */}
        {activeTab === 'pengeluaran' && (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border md:col-span-1">
              <h2 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
                <i data-lucide="wallet" className="w-4 h-4 text-red-500"></i> Catat Pengeluaran
              </h2>
              <form onSubmit={handleSaveExpense} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Judul / Keperluan</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: Beli Konsumsi / Listrik" 
                    value={newExpense.title}
                    onChange={(e) => setNewExpense({ ...newExpense, title: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs bg-gray-50"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Nominal (Rp)</label>
                  <input 
                    type="number" 
                    placeholder="0" 
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs font-bold text-red-600 bg-gray-50"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Keterangan (Opsional)</label>
                  <textarea 
                    placeholder="Catatan tambahan..." 
                    value={newExpense.note}
                    onChange={(e) => setNewExpense({ ...newExpense, note: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs bg-gray-50"
                    rows="2"
                  ></textarea>
                </div>
                <button 
                  type="submit" 
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg text-xs shadow transition">
                  Simpan Pengeluaran
                </button>
              </form>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border md:col-span-2">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-bold text-gray-800 text-sm">Riwayat Catatan Pengeluaran</h2>
                <span className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded font-bold">Total: {expenses.length} Data</span>
              </div>
              <div className="divide-y max-h-80 overflow-y-auto">
                {expenses.length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">Belum ada data pengeluaran tercatat.</p>
                ) : (
                  expenses.map(exp => (
                    <div key={exp.id} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-gray-800">{exp.title}</p>
                        <p className="text-[10px] text-gray-400">{new Date(exp.date).toLocaleString('id-ID')} • Oleh: <span className="uppercase font-semibold">{exp.inputBy}</span></p>
                        {exp.note && <p className="text-gray-500 mt-0.5">Catatan: {exp.note}</p>}
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className="font-extrabold text-red-600">- Rp {exp.amount.toLocaleString()}</p>
                        </div>
                        {userRole === 'full_admin' && (
                          <button 
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="bg-red-100 hover:bg-red-200 text-red-600 p-1.5 rounded transition" title="Hapus">
                            <i data-lucide="trash-2" className="w-3.5 h-3.5"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: INPUT / RESTOCK BARANG (FULL ADMIN & STOK ADMIN) */}
        {activeTab === 'input_barang' && (userRole === 'full_admin' || userRole === 'stok_admin') && (
          <div className="bg-white p-5 rounded-xl shadow-sm border max-w-lg mx-auto">
            <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
              <i data-lucide="plus-circle" className="text-blue-600"></i>
              Form Restock / Input Barang Masuk 
              {userRole === 'stok_admin' && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">({currentUsername})</span>}
            </h2>

            <form onSubmit={handleSaveProduct} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Barcode Barang</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Scan atau ketik barcode..." 
                    value={newProduct.barcode}
                    onChange={(e) => handleRestockInputChange('barcode', e.target.value)}
                    className="flex-1 border rounded-lg p-2 text-sm bg-gray-50 focus:bg-white"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => startScanner('admin_input')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1">
                    <i data-lucide="camera" className="w-4 h-4"></i> Scan
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Nama Barang</label>
                <input 
                  type="text" 
                  placeholder="Contoh: Oli Yamalube Matic 0.8L" 
                  value={newProduct.name}
                  onChange={(e) => handleRestockInputChange('name', e.target.value)}
                  readOnly={userRole === 'stok_admin' && isExistingProductLocked}
                  className={`w-full border rounded-lg p-2 text-sm ${userRole === 'stok_admin' && isExistingProductLocked ? 'bg-gray-200 text-gray-600 cursor-not-allowed font-semibold' : 'bg-gray-50 focus:bg-white'}`}
                  required
                />
                {userRole === 'stok_admin' && isExistingProductLocked && (
                  <p className="text-[10px] text-amber-600 mt-0.5"></p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Harga Modal (Rp)</label>
                  <input 
                    type="number" 
                    placeholder="0" 
                    value={newProduct.buyPrice}
                    onChange={(e) => handleRestockInputChange('buyPrice', e.target.value)}
                    readOnly={userRole === 'stok_admin' && isExistingProductLocked}
                    className={`w-full border rounded-lg p-2 text-sm ${userRole === 'stok_admin' && isExistingProductLocked ? 'bg-gray-200 text-gray-600 cursor-not-allowed font-semibold' : 'bg-gray-50 focus:bg-white'}`}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Harga Jual (Rp)</label>
                  <input 
                    type="number" 
                    placeholder="0" 
                    value={newProduct.price}
                    onChange={(e) => handleRestockInputChange('price', e.target.value)}
                    readOnly={userRole === 'stok_admin' && isExistingProductLocked}
                    className={`w-full border rounded-lg p-2 text-sm ${userRole === 'stok_admin' && isExistingProductLocked ? 'bg-gray-200 text-gray-600 cursor-not-allowed font-semibold' : 'bg-gray-50 focus:bg-white'}`}
                    required
                  />
                </div>
              </div>
              {userRole === 'stok_admin' && isExistingProductLocked && (
                <p className="text-[10px] text-amber-600"></p>
              )}

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Jumlah Stok Masuk (Pcs) <span className="text-emerald-600 font-extrabold"></span></label>
                <input 
                  type="number" 
                  min="1"
                  placeholder="0" 
                  value={newProduct.stock}
                  onChange={(e) => handleRestockInputChange('stock', e.target.value)}
                  className="w-full border rounded-lg p-2 text-sm bg-gray-50 focus:bg-white font-bold text-emerald-700"
                  required
                />
                <p className="text-[10px] text-gray-400 mt-1">*Masukkan jumlah stok tambahan yang masuk.</p>
              </div>

              <button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm shadow transition">
                Simpan / Tambahkan Stok ke Database
              </button>
            </form>
          </div>
        )}

        {/* TAB: LAPORAN KEUANGAN */}
        {activeTab === 'laporan' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h3 className="font-bold text-gray-800 text-sm">Filter Periode Laporan Keuangan</h3>
                <button 
                  onClick={downloadPDFReport}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow transition active:scale-95">
                  <i data-lucide="download" className="w-4 h-4"></i> Unduh Laporan PDF
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button 
                  onClick={() => setReportFilterType('hari')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition ${reportFilterType === 'hari' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  📅 Hari Ini
                </button>
                <button 
                  onClick={() => setReportFilterType('minggu')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition ${reportFilterType === 'minggu' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  📊 7 Hari Terakhir
                </button>
                <button 
                  onClick={() => setReportFilterType('bulan')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition ${reportFilterType === 'bulan' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  📈 Bulan Ini
                </button>
                <button 
                  onClick={() => setReportFilterType('custom')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition ${reportFilterType === 'custom' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  🔍 Rentang Tanggal
                </button>
              </div>

              {reportFilterType === 'custom' && (
                <div className="bg-slate-50 p-3 rounded-lg border flex flex-col sm:flex-row gap-2 items-center">
                  <div className="w-full">
                    <label className="text-[11px] font-bold text-gray-600 block mb-1">Dari Tanggal:</label>
                    <input 
                      type="date" 
                      value={customStartDate} 
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full border p-2 text-xs rounded bg-white"
                    />
                  </div>
                  <div className="w-full">
                    <label className="text-[11px] font-bold text-gray-600 block mb-1">Sampai Tanggal:</label>
                    <input 
                      type="date" 
                      value={customEndDate} 
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full border p-2 text-xs rounded bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Executive Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-xl border shadow-sm">
                <p className="text-[10px] text-gray-500 font-bold uppercase">Total Omset</p>
                <p className="text-sm font-extrabold text-blue-600">Rp {totalOmset.toLocaleString()}</p>
              </div>
              <div className="bg-white p-3.5 rounded-xl border shadow-sm">
                <p className="text-[10px] text-gray-500 font-bold uppercase">Pendapatan Jasa</p>
                <p className="text-sm font-extrabold text-indigo-600">Rp {totalJasa.toLocaleString()}</p>
              </div>
              <div className="bg-white p-3.5 rounded-xl border shadow-sm">
                <p className="text-[10px] text-gray-500 font-bold uppercase">Total Pengeluaran</p>
                <p className="text-sm font-extrabold text-red-600">Rp {totalPengeluaran.toLocaleString()}</p>
              </div>
              <div className="bg-white p-3.5 rounded-xl border shadow-sm">
                <p className="text-[10px] text-gray-500 font-bold uppercase">Est. Laba Bersih</p>
                <p className="text-sm font-extrabold text-emerald-600">Rp {totalLabaBersih.toLocaleString()}</p>
              </div>
            </div>

            {/* Transaction History Log */}
            <div className="bg-white p-4 rounded-xl shadow-sm border">
              <h3 className="font-bold text-gray-800 mb-3 text-sm">
                Riwayat Transaksi Terfilter ({filteredTransactions.length} Transaksi)
              </h3>
              <div className="divide-y max-h-80 overflow-y-auto">
                {filteredTransactions.length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">Tidak ada transaksi pada periode ini.</p>
                ) : (
                  filteredTransactions.map(t => (
                    <div key={t.id} className="py-3 text-xs flex justify-between items-center gap-2">
                      <div className="flex-1">
                        <div className="flex justify-between font-semibold text-gray-800">
                          <span>{t.id}</span>
                          <span className="text-emerald-600 font-bold">+ Rp {t.total.toLocaleString()}</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{new Date(t.date).toLocaleString('id-ID')}</p>
                        <div className="mt-1 text-gray-600 space-y-0.5">
                          {t.items && t.items.map(i => (
                            <span key={i.id} className="block">• {i.name} ({i.qty}x)</span>
                          ))}
                          {t.serviceFee > 0 && (
                            <span className="block text-indigo-600">• Jasa: {t.serviceNote || 'Servis'} (Rp {t.serviceFee.toLocaleString()})</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          onClick={() => printBluetoothReceipt(t)}
                          className="bg-slate-100 hover:bg-slate-200 border text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition">
                          <i data-lucide="printer" className="w-3.5 h-3.5"></i> Cetak Ulang
                        </button>
                        
                        {userRole === 'full_admin' && (
                          <button 
                            onClick={() => handleDeleteTransaction(t.id)}
                            className="bg-red-100 hover:bg-red-200 text-red-600 p-2 rounded-lg transition" title="Hapus Transaksi">
                            <i data-lucide="trash-2" className="w-3.5 h-3.5"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
