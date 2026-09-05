import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Filter,
  FileImage,
  Leaf,
  LoaderCircle,
  LogOut,
  MapPin,
  Package,
  Plus,
  Search,
  ShoppingBasket,
  Sprout,
  Store,
  Truck,
  UserRound,
  Wheat,
  X,
} from 'lucide-react';
import {
  getGetListingQueryKey,
  getGetOrderQueryKey,
  getListListingsQueryKey,
  getListOrdersQueryKey,
  useCreateListing,
  useCreateOrder,
  useCreateUser,
  useDeleteListing,
  useGetListing,
  useGetOrder,
  useListListings,
  useListOrders,
  useUpdateListing,
  useUpdateOrderStatus,
  requestStorageUploadUrl,
  type Listing,
  type Order,
  type OrderStatus,
  type User,
  type UserInputRole,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const SESSION_KEY = 'agrilink-current-user';
const roles: { value: UserInputRole; label: string; detail: string; icon: typeof Sprout }[] = [
  { value: 'farmer', label: 'Farmer', detail: 'I grow and supply produce', icon: Sprout },
  { value: 'fpo', label: 'FPO', detail: 'We coordinate several growers', icon: Store },
  { value: 'buyer', label: 'Buyer', detail: 'I source for my business', icon: ShoppingBasket },
];
const statuses: OrderStatus[] = ['placed', 'confirmed', 'ready', 'completed'];

function readSession(): User | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? (JSON.parse(value) as User) : null;
  } catch {
    return null;
  }
}

function money(value: number) {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function roleLabel(role: UserInputRole) {
  return role === 'fpo' ? 'FPO' : role === 'buyer' ? 'Buyer' : 'Farmer';
}

function statusLabel(status: OrderStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function MessageState({ kind, title, detail, action }: { kind: 'loading' | 'empty' | 'error' | 'success'; title: string; detail: string; action?: ReactNode }) {
  const Icon = kind === 'loading' ? LoaderCircle : kind === 'error' ? CircleAlert : kind === 'success' ? CircleCheck : Package;
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center ${kind === 'error' ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card/60'}`} data-testid={`state-${kind}`}>
      <div className={`mb-4 rounded-full p-3 ${kind === 'error' ? 'bg-destructive/10 text-destructive' : kind === 'success' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
        <Icon className={`h-6 w-6 ${kind === 'loading' ? 'animate-spin' : ''}`} />
      </div>
      <h3 className="serif text-xl font-semibold" data-testid={`text-state-title-${kind}`}>{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground" data-testid={`text-state-detail-${kind}`}>{detail}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const className = status === 'completed' ? 'border-primary/20 bg-primary/10 text-primary' : status === 'ready' ? 'border-accent/40 bg-accent/20 text-accent-foreground' : status === 'confirmed' ? 'border-sky-700/20 bg-sky-100 text-sky-900' : 'border-border bg-muted text-muted-foreground';
  return <Badge className={className} data-testid={`status-order-${status}`}>{statusLabel(status)}</Badge>;
}

function QualityBadge({ grade }: { grade?: Listing['qualityGrade'] | null }) {
  if (!grade) return null;
  const className =
    grade === 'Good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : grade === 'Medium'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-red-200 bg-red-50 text-red-800';
  return <Badge className={className} data-testid={`badge-quality-${grade.toLowerCase()}`}>AI quality: {grade}</Badge>;
}

function Mark({ small = false }: { small?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${small ? 'text-base' : 'text-lg'}`} data-testid="brand-agrilink">
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-accent-foreground">
        <Leaf className="h-4 w-4" />
        <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-primary" />
      </span>
      <span className="font-semibold tracking-tight">Agri<span className="text-accent">Link</span></span>
    </div>
  );
}

function Shell({ user, onLogout, children }: { user: User | null; onLogout: () => void; children: ReactNode }) {
  const [location] = useLocation();
  const isLogin = location === '/login';
  if (isLogin || !user) return <>{children}</>;
  const isSeller = user.role !== 'buyer';
  const links = isSeller
    ? [{ href: '/orders', label: 'Trade desk', icon: ClipboardList }, { href: '/listings/new', label: 'Add produce', icon: Plus }]
    : [{ href: '/browse', label: 'Find produce', icon: Search }, { href: '/orders', label: 'My orders', icon: ClipboardList }];
  return (
    <div className="market-shell flex bg-background text-foreground">
      <aside className="hidden min-h-[100dvh] w-[248px] shrink-0 flex-col bg-sidebar px-5 py-6 text-sidebar-foreground md:flex">
        <Link href={isSeller ? '/orders' : '/browse'} className="mb-12" data-testid="link-sidebar-home"><Mark /></Link>
        <p className="eyebrow mb-3 text-sidebar-foreground/50">Your workspace</p>
        <nav className="space-y-1" aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${location === href ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/50 p-4">
          <p className="eyebrow text-sidebar-foreground/50">Direct trade</p>
          <p className="mt-2 text-sm leading-5 text-sidebar-foreground/80">A clear path from harvest to a real buyer.</p>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-sidebar-border pt-5">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-sidebar-primary font-semibold text-sidebar-primary-foreground" data-testid="avatar-current-user">{user.name.charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" data-testid="text-current-user">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/50" data-testid="text-current-role">{roleLabel(user.role)}</p>
          </div>
          <button onClick={onLogout} className="rounded-md p-2 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Log out" data-testid="button-logout"><LogOut className="h-4 w-4" /></button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur md:hidden">
          <Link href={isSeller ? '/orders' : '/browse'} data-testid="link-mobile-home"><Mark small /></Link>
          <div className="flex items-center gap-2">
            <Link href={isSeller ? '/listings/new' : '/orders'} className="rounded-lg p-2 text-muted-foreground" data-testid="link-mobile-action"><ClipboardList className="h-5 w-5" /></Link>
            <button onClick={onLogout} className="rounded-lg p-2 text-muted-foreground" aria-label="Log out" data-testid="button-mobile-logout"><LogOut className="h-5 w-5" /></button>
          </div>
        </header>
        <main className="w-full flex-1">{children}</main>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const createUser = useCreateUser();
  const [role, setRole] = useState<UserInputRole>('buyer');
  const [message, setMessage] = useState('');
  const form = useForm<{ name: string; email: string }>({ defaultValues: { name: '', email: '' } });
  const submit = form.handleSubmit((values) => {
    setMessage('');
    createUser.mutate({ data: { name: values.name.trim(), email: values.email.trim() || null, role } }, {
      onSuccess: (user) => {
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        onLogin(user);
      },
      onError: () => setMessage('We could not create your profile. Please try again.'),
    });
  });
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-sidebar px-5 py-8 text-sidebar-foreground md:px-10">
      <div className="absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full border border-sidebar-border/60" />
      <div className="absolute -right-20 -top-20 h-[320px] w-[320px] rounded-full border border-sidebar-border/40" />
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-16 md:min-h-[calc(100dvh-4rem)] md:flex-row md:items-center md:gap-20">
        <section className="max-w-xl pt-4 md:pt-0">
          <Mark />
          <div className="mt-16 md:mt-24">
            <p className="eyebrow text-accent">Local produce, clearly traded</p>
            <h1 className="serif mt-5 text-5xl leading-[.98] tracking-[-.04em] md:text-7xl">Good harvests<br /><span className="text-accent">go further.</span></h1>
            <p className="mt-7 max-w-md text-base leading-7 text-sidebar-foreground/65">AgriLink connects the people who grow food with the businesses ready to buy it — without the opaque middle layers.</p>
          </div>
          <div className="mt-12 hidden items-center gap-8 border-t border-sidebar-border pt-5 text-xs text-sidebar-foreground/50 md:flex">
            <span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-accent" /> Direct relationships</span>
            <span className="flex items-center gap-2"><Truck className="h-4 w-4 text-accent" /> Visible order progress</span>
          </div>
        </section>
        <Card className="w-full max-w-md border-sidebar-border bg-card text-card-foreground shadow-2xl">
          <CardHeader className="pb-3">
            <p className="eyebrow text-primary">Start here</p>
            <CardTitle className="serif text-3xl tracking-tight">Tell us how you trade</CardTitle>
            <p className="text-sm text-muted-foreground">No password. Just your name, role, and a shared marketplace.</p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={submit} className="space-y-5" data-testid="form-login">
                <div>
                  <label htmlFor="login-name" className="mb-2 block text-sm font-medium">Your name</label>
                  <Input id="login-name" placeholder="e.g. Meera Kulkarni" {...form.register('name', { required: 'Please enter your name.' })} data-testid="input-name" />
                  {form.formState.errors.name ? <p className="mt-1 text-xs text-destructive" data-testid="error-name">{form.formState.errors.name.message}</p> : null}
                </div>
                <div>
                  <label htmlFor="login-email" className="mb-2 block text-sm font-medium">Email <span className="font-normal text-muted-foreground">(optional)</span></label>
                  <Input id="login-email" type="email" placeholder="you@farm or business.in" {...form.register('email')} data-testid="input-email" />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">I am joining as a</p>
                  <div className="grid gap-2">
                    {roles.map(({ value, label, detail, icon: Icon }) => (
                      <button type="button" key={value} onClick={() => setRole(value)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${role === value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted'}`} data-testid={`button-role-${value}`}>
                        <span className={`grid h-9 w-9 place-items-center rounded-lg ${role === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><Icon className="h-4 w-4" /></span>
                        <span className="flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{detail}</span></span>
                        {role === value ? <CircleCheck className="h-4 w-4 text-primary" /> : null}
                      </button>
                    ))}
                  </div>
                </div>
                {message ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="state-login-error">{message}</p> : null}
                <Button type="submit" className="h-11 w-full" disabled={createUser.isPending} data-testid="button-continue">
                  {createUser.isPending ? <LoaderCircle className="animate-spin" /> : null}
                  Enter AgriLink <ArrowRight />
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Browse() {
  const [search, setSearch] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const params = useMemo(() => ({ cropType: search.trim() || undefined, minPrice: minPrice ? Number(minPrice) : undefined, maxPrice: maxPrice ? Number(maxPrice) : undefined }), [search, minPrice, maxPrice]);
  const listings = useListListings(params);
  const items = listings.data ?? [];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-10 md:py-12">
      <div className="rise-in flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-primary">The open market</p>
          <h1 className="serif mt-3 text-4xl tracking-[-.035em] md:text-6xl" data-testid="heading-browse">Find your next harvest.</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Browse what is available now, with price and source visible up front.</p>
        </div>
        <div className="rounded-2xl bg-primary px-4 py-3 text-primary-foreground md:min-w-[170px]" data-testid="summary-listings">
          <p className="eyebrow text-primary-foreground/60">Available now</p>
          <p className="serif mt-1 text-3xl">{items.length}<span className="ml-1 text-sm font-sans font-normal text-primary-foreground/70">lots</span></p>
        </div>
      </div>
      <div className="mt-9 rounded-2xl border border-border bg-card p-3 soft-shadow md:p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 border-0 bg-muted pl-10 shadow-none" placeholder="Search by crop, like onion or turmeric" aria-label="Search produce" data-testid="input-search-listings" />
          </div>
          <Button type="button" variant="outline" className="h-11 md:hidden" onClick={() => setShowFilters((value) => !value)} data-testid="button-toggle-filters"><Filter /> Filters</Button>
          <div className={`${showFilters ? 'grid' : 'hidden'} grid-cols-2 gap-3 md:grid md:w-[300px]`}>
            <Input type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} className="h-11" placeholder="Min ₹/unit" aria-label="Minimum price" data-testid="input-min-price" />
            <Input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} className="h-11" placeholder="Max ₹/unit" aria-label="Maximum price" data-testid="input-max-price" />
          </div>
        </div>
      </div>
      <div className="mt-9">
        {listings.isLoading ? <ListingSkeletons /> : listings.isError ? <MessageState kind="error" title="The market is taking a pause" detail="Listings could not be loaded. Try again in a moment." action={<Button onClick={() => listings.refetch()} data-testid="button-retry-listings">Retry</Button>} /> : items.length === 0 ? <MessageState kind="empty" title="No matching produce yet" detail="Try a wider search or check back soon. New harvests appear as growers are ready." action={<Button variant="outline" onClick={() => { setSearch(''); setMinPrice(''); setMaxPrice(''); }} data-testid="button-clear-filters">Clear filters</Button>} /> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((listing, index) => <ListingCard key={listing.id} listing={listing} index={index} />)}</div>}
      </div>
    </div>
  );
}

function ListingSkeletons() {
  return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="overflow-hidden rounded-2xl border border-border bg-card" data-testid={`skeleton-listing-${item}`}><div className="skeleton h-40" /><div className="space-y-3 p-5"><div className="skeleton h-5 w-2/3 rounded" /><div className="skeleton h-4 w-1/2 rounded" /><div className="skeleton h-10 w-full rounded" /></div></div>)}</div>;
}

function ListingCard({ listing, index }: { listing: Listing; index: number }) {
  const cropColor = index % 3 === 0 ? 'from-primary/20 to-accent/40' : index % 3 === 1 ? 'from-accent/30 to-orange-200/60' : 'from-sky-100 to-primary/15';
  return (
    <Link href={`/listings/${listing.id}`} className="group pressable overflow-hidden rounded-2xl border border-border bg-card soft-shadow" data-testid={`card-listing-${listing.id}`}>
      <div className={`relative flex h-40 items-end overflow-hidden bg-gradient-to-br ${cropColor} p-5`}>
        {listing.photoUrl ? <img src={listing.photoUrl} alt={listing.cropType} className="absolute inset-0 h-full w-full object-cover mix-blend-multiply" data-testid={`img-listing-${listing.id}`} /> : <Wheat className="absolute -bottom-6 -right-1 h-40 w-40 rotate-12 text-primary/15" />}
        <div className="relative flex w-full items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap gap-2"><Badge className="border-card/70 bg-card/90 text-foreground" data-testid={`badge-location-${listing.id}`}><MapPin className="mr-1 h-3 w-3" /> {listing.location}</Badge><QualityBadge grade={listing.qualityGrade} /></div><span className="rounded-full bg-sidebar px-2 py-1 font-mono text-[10px] text-sidebar-foreground">LOT {String(index + 1).padStart(2, '0')}</span></div>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 className="serif text-2xl" data-testid={`text-crop-${listing.id}`}>{listing.cropType}</h2><p className="mt-1 text-xs text-muted-foreground">Listed {dateLabel(listing.createdAt)}</p></div><ArrowRight className="mt-1 h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" /></div>
        <div className="mt-6 flex items-end justify-between border-t border-border pt-4"><div><p className="eyebrow text-muted-foreground">Available</p><p className="mt-1 text-sm font-semibold" data-testid={`text-quantity-${listing.id}`}>{listing.availableQuantity} {listing.unit}</p></div><div className="text-right"><p className="eyebrow text-muted-foreground">Price</p><p className="mt-1 font-mono text-lg font-medium text-primary" data-testid={`text-price-${listing.id}`}>{money(listing.pricePerUnit)}<span className="text-xs text-muted-foreground">/{listing.unit}</span></p></div></div>
      </div>
    </Link>
  );
}

function NewListing({ user }: { user: User }) {
  const [, setLocation] = useLocation();
  const createListing = useCreateListing();
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const form = useForm<{ cropType: string; quantity: string; unit: string; pricePerUnit: string; location: string; photoUrl: string }>({ defaultValues: { cropType: '', quantity: '', unit: 'kg', pricePerUnit: '', location: '', photoUrl: '' } });
  const submit = form.handleSubmit(async (values) => {
    setMessage('');
    let photoUrl = values.photoUrl.trim() || null;
    if (photoFile) {
      setUploadingPhoto(true);
      try {
        const upload = await requestStorageUploadUrl({
          sellerId: user.id,
          name: photoFile.name,
          size: photoFile.size,
          contentType: photoFile.type as 'image/jpeg' | 'image/png' | 'image/webp',
        });
        const uploadResponse = await fetch(upload.uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': photoFile.type },
          body: photoFile,
        });
        if (!uploadResponse.ok) throw new Error('Photo upload failed');
        photoUrl = `/api/storage${upload.objectPath}`;
      } catch {
        setUploadingPhoto(false);
        setMessage('Could not upload the crop photo. Use a JPEG, PNG, or WebP image under 8 MB.');
        return;
      }
      setUploadingPhoto(false);
    }
    createListing.mutate({ data: { sellerId: user.id, cropType: values.cropType.trim(), quantity: Number(values.quantity), unit: values.unit.trim(), pricePerUnit: Number(values.pricePerUnit), location: values.location.trim(), photoUrl } }, {
      onSuccess: (listing) => {
        qc.invalidateQueries({ queryKey: getListListingsQueryKey() });
        setLocation(`/listings/${listing.id}`);
      },
      onError: () => setMessage('Could not publish this lot. Check the details and try again.'),
    });
  });
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-10 md:py-12">
      <Link href="/orders" className="mb-9 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-trade-desk"><ChevronLeft className="h-4 w-4" /> Back to trade desk</Link>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <p className="eyebrow text-primary">Put it on the market</p>
          <h1 className="serif mt-3 text-5xl tracking-[-.04em]" data-testid="heading-new-listing">List a fresh lot.</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Give buyers the details they need to make a confident order. You can update or remove the lot from your trade desk.</p>
          <Card className="mt-8 border-border bg-card">
            <CardContent className="p-5 md:p-7">
              <Form {...form}><form onSubmit={submit} className="space-y-5" data-testid="form-new-listing">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium" htmlFor="cropType">What are you selling?</label><Input id="cropType" placeholder="e.g. Red onions" {...form.register('cropType', { required: 'Crop name is required.' })} data-testid="input-crop-type" />{form.formState.errors.cropType ? <p className="mt-1 text-xs text-destructive">{form.formState.errors.cropType.message}</p> : null}</div>
                  <div><label className="mb-2 block text-sm font-medium" htmlFor="quantity">Total quantity</label><Input id="quantity" type="number" min="0.01" step="0.01" placeholder="e.g. 800" {...form.register('quantity', { required: 'Quantity is required.', min: 0.01 })} data-testid="input-quantity" /></div>
                  <div><label className="mb-2 block text-sm font-medium" htmlFor="unit">Unit</label><Input id="unit" placeholder="kg, crates, bags" {...form.register('unit', { required: 'Unit is required.' })} data-testid="input-unit" /></div>
                  <div><label className="mb-2 block text-sm font-medium" htmlFor="pricePerUnit">Price per unit</label><Input id="pricePerUnit" type="number" min="0.01" step="0.01" placeholder="e.g. 32" {...form.register('pricePerUnit', { required: 'Price is required.', min: 0.01 })} data-testid="input-price" /></div>
                  <div><label className="mb-2 block text-sm font-medium" htmlFor="location">Pickup location</label><Input id="location" placeholder="e.g. Nashik, MH" {...form.register('location', { required: 'Location is required.' })} data-testid="input-location" /></div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium" htmlFor="photoFile">Crop photo <span className="font-normal text-muted-foreground">(optional, tomatoes supported)</span></label>
                    <Input id="photoFile" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} data-testid="input-photo-file" />
                    <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><FileImage className="h-3.5 w-3.5" /> Upload one image up to 8 MB. Tomato photos receive an AI quality grade.</p>
                    {photoFile ? <p className="mt-2 text-xs text-primary" data-testid="text-selected-photo">{photoFile.name}</p> : null}
                    <div className="mt-4"><label className="mb-2 block text-xs font-medium text-muted-foreground" htmlFor="photoUrl">Or use an existing photo URL</label><Input id="photoUrl" placeholder="https://..." {...form.register('photoUrl')} data-testid="input-photo-url" /></div>
                  </div>
                </div>
                {message ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="state-listing-error">{message}</p> : null}
                <Button type="submit" className="h-11 w-full sm:w-auto" disabled={createListing.isPending || uploadingPhoto} data-testid="button-publish-listing">{createListing.isPending || uploadingPhoto ? <LoaderCircle className="animate-spin" /> : <Plus />} {uploadingPhoto ? 'Uploading photo…' : 'Publish this lot'}</Button>
              </form></Form>
            </CardContent>
          </Card>
        </div>
        <aside className="hidden lg:block"><div className="line-art sticky top-8 rounded-2xl border border-border p-6"><p className="eyebrow text-primary">A useful listing</p><h2 className="serif mt-3 text-2xl">Specific details build trust.</h2><ul className="mt-6 space-y-4 text-sm text-muted-foreground"><li className="flex gap-3"><span className="mono text-accent">01</span> Name the crop the way buyers know it.</li><li className="flex gap-3"><span className="mono text-accent">02</span> Use a real pickup location.</li><li className="flex gap-3"><span className="mono text-accent">03</span> Keep quantity available and price clear.</li></ul></div></aside>
      </div>
    </div>
  );
}

function ListingDetail({ user }: { user: User }) {
  const { listingId = '' } = useParams<{ listingId: string }>();
  const [, setLocation] = useLocation();
  const listing = useGetListing(listingId);
  const createOrder = useCreateOrder();
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState('1');
  const [message, setMessage] = useState('');
  if (listing.isLoading) return <div className="mx-auto max-w-5xl px-4 py-12"><div className="skeleton h-8 w-24 rounded" /><div className="mt-7 skeleton h-72 rounded-2xl" /></div>;
  if (listing.isError || !listing.data) return <div className="mx-auto max-w-5xl px-4 py-12"><MessageState kind="error" title="Lot not found" detail="This listing may have been sold or removed." action={<Link href="/browse" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground" data-testid="link-back-browse">Back to market</Link>} /></div>;
  const item = listing.data;
  const total = Number(quantity || 0) * item.pricePerUnit;
  const isBuyer = user.role === 'buyer';
  const placeOrder = (event: FormEvent) => {
    event.preventDefault();
    if (!isBuyer || Number(quantity) <= 0 || Number(quantity) > item.availableQuantity) return;
    setMessage('');
    createOrder.mutate({ data: { buyerId: user.id, listingId: item.id, quantity: Number(quantity) } }, {
      onSuccess: (order) => {
        qc.invalidateQueries({ queryKey: getListOrdersQueryKey({ buyerId: user.id }) });
        qc.invalidateQueries({ queryKey: getGetListingQueryKey(item.id) });
        setMessage(`Order ${order.id.slice(0, 8)} is placed. You can follow its progress in My orders.`);
      },
      onError: () => setMessage('This order could not be placed. The available quantity may have changed.'),
    });
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-10 md:py-12">
      <Link href="/browse" className="mb-9 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-market"><ChevronLeft className="h-4 w-4" /> Back to market</Link>
      <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
        <div>
           <div className="relative flex min-h-[360px] items-end overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-accent/30 to-orange-100 p-7">
            {item.photoUrl ? <img src={item.photoUrl} alt={item.cropType} className="absolute inset-0 h-full w-full object-cover mix-blend-multiply" data-testid={`img-detail-${item.id}`} /> : <Wheat className="absolute -bottom-10 -right-5 h-80 w-80 rotate-12 text-primary/15" />}
            <div className="relative flex flex-wrap items-center gap-2"><Badge className="border-card/60 bg-card/90 text-foreground" data-testid={`badge-detail-location-${item.id}`}><MapPin className="mr-1 h-3 w-3" /> {item.location}</Badge><Badge className="border-sidebar bg-sidebar text-sidebar-foreground">Available now</Badge><QualityBadge grade={item.qualityGrade} /></div>
          </div>
           <div className="mt-7"><p className="eyebrow text-primary">Produce lot</p><h1 className="serif mt-2 text-5xl tracking-[-.04em]" data-testid={`heading-listing-${item.id}`}>{item.cropType}</h1><p className="mt-3 text-sm text-muted-foreground">Listed on {dateLabel(item.createdAt)} · Pickup in {item.location}</p>{item.qualityReason ? <p className="mt-4 max-w-xl rounded-xl border border-border bg-card p-4 text-sm leading-6 text-muted-foreground" data-testid={`text-quality-reason-${item.id}`}><span className="font-medium text-foreground">AI assessment:</span> {item.qualityReason}</p> : null}</div>
        </div>
        <Card className="h-fit border-border bg-card soft-shadow">
          <CardHeader><p className="eyebrow text-muted-foreground">Straight from the source</p><CardTitle className="serif text-2xl">Make an order</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end justify-between border-b border-border pb-5"><div><p className="text-sm text-muted-foreground">Available</p><p className="mt-1 text-xl font-semibold" data-testid={`text-detail-available-${item.id}`}>{item.availableQuantity} {item.unit}</p></div><div className="text-right"><p className="text-sm text-muted-foreground">Price</p><p className="mt-1 font-mono text-2xl text-primary" data-testid={`text-detail-price-${item.id}`}>{money(item.pricePerUnit)}<span className="text-xs text-muted-foreground">/{item.unit}</span></p></div></div>
            {isBuyer ? <form onSubmit={placeOrder} className="mt-6 space-y-5" data-testid="form-place-order"><div><label className="mb-2 block text-sm font-medium" htmlFor="order-quantity">How much do you need?</label><div className="flex items-center gap-2"><Input id="order-quantity" type="number" min="0.01" max={item.availableQuantity} step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} data-testid="input-order-quantity" /><span className="w-16 text-sm text-muted-foreground">{item.unit}</span></div></div><div className="flex items-center justify-between rounded-xl bg-muted p-4"><span className="text-sm text-muted-foreground">Order total</span><span className="font-mono text-lg font-medium" data-testid="text-order-total">{money(total)}</span></div>{message ? <p className={`rounded-lg p-3 text-sm ${message.startsWith('Order') ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`} data-testid="state-order-result">{message}</p> : null}<Button type="submit" className="h-11 w-full" disabled={createOrder.isPending || Number(quantity) <= 0 || Number(quantity) > item.availableQuantity} data-testid="button-place-order">{createOrder.isPending ? <LoaderCircle className="animate-spin" /> : <ShoppingBasket />} Place order</Button></form> : <div className="mt-6 rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground" data-testid="state-seller-view">You are viewing this lot as a {roleLabel(user.role)}. Buyer orders will appear in your trade desk.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Orders({ user }: { user: User }) {
  const isSeller = user.role !== 'buyer';
  const params = useMemo(() => isSeller ? { sellerId: user.id } : { buyerId: user.id }, [isSeller, user.id]);
  const orders = useListOrders(params);
  const listings = useListListings(isSeller ? { sellerId: user.id } : undefined, { query: { enabled: isSeller, queryKey: getListListingsQueryKey(isSeller ? { sellerId: user.id } : undefined) } });
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const selected = useGetOrder(selectedOrderId ?? '', { query: { enabled: Boolean(selectedOrderId), queryKey: getGetOrderQueryKey(selectedOrderId ?? '') } });
  const updateStatus = useUpdateOrderStatus();
  const deleteListing = useDeleteListing();
  const updateListing = useUpdateListing();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const orderItems = orders.data ?? [];
  const listingItems = listings.data ?? [];
  const advanceOrder = (order: Order) => {
    const next = statuses[Math.min(statuses.indexOf(order.status) + 1, statuses.length - 1)];
    if (next === order.status) return;
    updateStatus.mutate({ orderId: order.id, data: { status: next, actorId: user.id } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListOrdersQueryKey(params) }); qc.invalidateQueries({ queryKey: getGetOrderQueryKey(order.id) }); setActionMessage(`Order ${order.id.slice(0, 8)} moved to ${statusLabel(next)}.`); }, onError: () => setActionMessage('That status update did not go through.') });
  };
  const saveListing = (listing: Listing) => {
    const value = Number(editPrice);
    if (!value || value <= 0) return;
    updateListing.mutate({ listingId: listing.id, data: { pricePerUnit: value } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListListingsQueryKey({ sellerId: user.id }) }); setEditingId(null); setActionMessage('Listing price updated.'); } });
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-10 md:py-12">
      <div className="rise-in flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow text-primary">{isSeller ? 'Seller workspace' : 'Your trade trail'}</p><h1 className="serif mt-3 text-4xl tracking-[-.035em] md:text-6xl" data-testid="heading-orders">{isSeller ? 'Keep trade moving.' : 'Know where it stands.'}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{isSeller ? 'See every incoming order and keep your available lots current.' : 'Every order has a visible next step, from placed to completed.'}</p></div><div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm" data-testid="summary-orders"><ClipboardList className="h-4 w-4 text-primary" /><span className="font-semibold">{orderItems.length}</span><span className="text-muted-foreground">{orderItems.length === 1 ? 'order' : 'orders'}</span></div></div>
      {actionMessage ? <div className="mt-7 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary" data-testid="state-order-action"><span className="flex items-center gap-2"><CircleCheck className="h-4 w-4" /> {actionMessage}</span><button onClick={() => setActionMessage('')} aria-label="Dismiss message" data-testid="button-dismiss-message"><X className="h-4 w-4" /></button></div> : null}
      <div className="mt-9 grid gap-8 lg:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-4 flex items-center justify-between"><h2 className="serif text-2xl">{isSeller ? 'Incoming orders' : 'Recent orders'}</h2><span className="eyebrow text-muted-foreground">Live status</span></div>
          {orders.isLoading ? <div className="space-y-3">{[1, 2].map((item) => <div className="skeleton h-28 rounded-2xl" key={item} data-testid={`skeleton-order-${item}`} />)}</div> : orders.isError ? <MessageState kind="error" title="Orders are unavailable" detail="We could not load the trade trail right now." action={<Button onClick={() => orders.refetch()} data-testid="button-retry-orders">Retry</Button>} /> : orderItems.length === 0 ? <MessageState kind="empty" title={isSeller ? 'No orders yet' : 'Your order trail is empty'} detail={isSeller ? 'When a buyer orders one of your lots, it will show up here.' : 'Browse available produce and place your first order when you find the right lot.'} action={!isSeller ? <Link href="/browse" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground" data-testid="link-browse-from-orders">Find produce <ArrowRight className="h-4 w-4" /></Link> : undefined} /> : <div className="space-y-3">{orderItems.map((order) => <OrderRow key={order.id} order={order} isSeller={isSeller} onSelect={() => setSelectedOrderId(order.id)} onAdvance={() => advanceOrder(order)} updating={updateStatus.isPending} />)}</div>}
        </section>
        <aside>
          {isSeller ? <SellerListings listings={listingItems} isLoading={listings.isLoading} editingId={editingId} editPrice={editPrice} onEdit={(listing) => { setEditingId(listing.id); setEditPrice(String(listing.pricePerUnit)); }} onCancel={() => setEditingId(null)} onPriceChange={setEditPrice} onSave={saveListing} onDelete={(listing) => { if (window.confirm(`Remove the ${listing.cropType} listing?`)) deleteListing.mutate({ listingId: listing.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListListingsQueryKey({ sellerId: user.id }) }); setActionMessage('Listing removed from the market.'); } }); }} /> : selectedOrderId ? <OrderDetail selected={selected.data} isLoading={selected.isLoading} onClose={() => setSelectedOrderId(null)} /> : <div className="line-art rounded-2xl border border-border p-6"><p className="eyebrow text-primary">A clear path</p><h2 className="serif mt-3 text-2xl">No guesswork.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Tap an order to see its full record. We keep the next step simple so you can plan around it.</p></div>}
        </aside>
      </div>
    </div>
  );
}

function OrderRow({ order, isSeller, onSelect, onAdvance, updating }: { order: Order; isSeller: boolean; onSelect: () => void; onAdvance: () => void; updating: boolean }) {
  const next = statuses[Math.min(statuses.indexOf(order.status) + 1, statuses.length - 1)];
  return <Card className="pressable cursor-pointer border-border bg-card" onClick={onSelect} data-testid={`row-order-${order.id}`}><CardContent className="p-4 md:p-5"><div className="flex items-start justify-between gap-3"><div><p className="mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">Order {order.id.slice(0, 8)}</p><p className="mt-1 font-medium" data-testid={`text-order-id-${order.id}`}>{order.quantity} units · {money(order.totalAmount)}</p></div><StatusBadge status={order.status} /></div><div className="mt-5 flex items-center gap-1">{statuses.map((status, index) => <div key={status} className="flex flex-1 items-center gap-1"><span className={`h-2 w-2 shrink-0 rounded-full ${index <= statuses.indexOf(order.status) ? 'bg-primary' : 'bg-muted'}`} /><div className={`h-1 flex-1 rounded-full ${index < statuses.indexOf(order.status) ? 'bg-primary' : 'bg-muted'}`} /></div>)}</div><div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{dateLabel(order.createdAt)}</span>{isSeller && next !== order.status ? <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); onAdvance(); }} disabled={updating} data-testid={`button-advance-order-${order.id}`}>{updating ? <LoaderCircle className="animate-spin" /> : null} Mark {statusLabel(next)}</Button> : <span className="flex items-center gap-1">View details <ArrowRight className="h-3 w-3" /></span>}</div></CardContent></Card>;
}

function OrderDetail({ selected, isLoading, onClose }: { selected?: Order; isLoading: boolean; onClose: () => void }) {
  if (isLoading) return <div className="skeleton h-56 rounded-2xl" data-testid="skeleton-order-detail" />;
  if (!selected) return null;
  return <Card className="border-border bg-card" data-testid={`card-order-detail-${selected.id}`}><CardHeader className="flex-row items-start justify-between"><div><p className="eyebrow text-primary">Order record</p><CardTitle className="serif mt-2 text-2xl">#{selected.id.slice(0, 8)}</CardTitle></div><button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Close order details" data-testid="button-close-order-detail"><X className="h-4 w-4" /></button></CardHeader><CardContent><StatusBadge status={selected.status} /><div className="mt-6 space-y-4 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span className="font-medium" data-testid={`text-detail-order-quantity-${selected.id}`}>{selected.quantity}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Unit price</span><span className="font-mono">{money(selected.unitPrice)}</span></div><div className="flex justify-between border-t border-border pt-4"><span className="font-medium">Total</span><span className="font-mono text-lg text-primary" data-testid={`text-detail-order-total-${selected.id}`}>{money(selected.totalAmount)}</span></div></div></CardContent></Card>;
}

function SellerListings({ listings, isLoading, editingId, editPrice, onEdit, onCancel, onPriceChange, onSave, onDelete }: { listings: Listing[]; isLoading: boolean; editingId: string | null; editPrice: string; onEdit: (listing: Listing) => void; onCancel: () => void; onPriceChange: (value: string) => void; onSave: (listing: Listing) => void; onDelete: (listing: Listing) => void }) {
  return <Card className="border-border bg-card"><CardHeader><div className="flex items-center justify-between"><div><p className="eyebrow text-primary">Your supply</p><CardTitle className="serif mt-2 text-2xl">Active lots</CardTitle></div><Link href="/listings/new" className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground" aria-label="Add listing" data-testid="link-add-listing"><Plus className="h-4 w-4" /></Link></div></CardHeader><CardContent className="space-y-3">{isLoading ? <div className="skeleton h-20 rounded-xl" data-testid="skeleton-seller-listings" /> : listings.length === 0 ? <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground" data-testid="state-no-seller-listings">No active lots. Publish your next harvest.</div> : listings.map((listing) => <div className="rounded-xl border border-border p-3" key={listing.id} data-testid={`card-seller-listing-${listing.id}`}><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{listing.cropType}</p><p className="mt-1 text-xs text-muted-foreground">{listing.availableQuantity} {listing.unit} available</p></div><p className="font-mono text-sm text-primary">{money(listing.pricePerUnit)}</p></div>{editingId === listing.id ? <div className="mt-3 flex gap-2"><Input type="number" min="0.01" value={editPrice} onChange={(event) => onPriceChange(event.target.value)} aria-label="Updated listing price" data-testid={`input-edit-price-${listing.id}`} /><Button size="sm" onClick={() => onSave(listing)} data-testid={`button-save-listing-${listing.id}`}>Save</Button><Button size="sm" variant="ghost" onClick={onCancel} data-testid={`button-cancel-listing-${listing.id}`}>Cancel</Button></div> : <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => onEdit(listing)} data-testid={`button-edit-listing-${listing.id}`}>Edit price</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(listing)} data-testid={`button-delete-listing-${listing.id}`}>Remove</Button></div>}</div>)}</CardContent></Card>;
}

function Router({ user, onLogin, onLogout }: { user: User | null; onLogin: (user: User) => void; onLogout: () => void }) {
  const [location, setLocation] = useLocation();
  useEffect(() => {
    if (!user && location !== '/login') setLocation('/login');
    if (user && location === '/login') setLocation(user.role === 'buyer' ? '/browse' : '/orders');
  }, [location, setLocation, user]);
  return <Shell user={user} onLogout={onLogout}><ErrorBoundary resetKey={location}><Switch><Route path="/login"><Login onLogin={onLogin} /></Route><Route path="/browse"><Guard user={user}><Browse /></Guard></Route><Route path="/listings/new"><Guard user={user}><NewListing user={user as User} /></Guard></Route><Route path="/listings/:listingId"><Guard user={user}><ListingDetail user={user as User} /></Guard></Route><Route path="/orders"><Guard user={user}><Orders user={user as User} /></Guard></Route><Route path="/"><Redirect to={user?.role === 'buyer' ? '/browse' : '/orders'} /></Route><Route component={NotFound} /></Switch></ErrorBoundary></Shell>;
}

function Guard({ user, children }: { user: User | null; children: ReactNode }) {
  return user ? <>{children}</> : <Redirect to="/login" />;
}

function App() {
  const [user, setUser] = useState<User | null>(readSession);
  const login = (nextUser: User) => { setUser(nextUser); };
  const logout = () => { localStorage.removeItem(SESSION_KEY); setUser(null); };
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router user={user} onLogin={login} onLogout={logout} /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;