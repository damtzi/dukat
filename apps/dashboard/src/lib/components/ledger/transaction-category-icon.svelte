<script lang="ts">
  import type { MyOverview } from '@dukat/core/overview'
  import AirplaneIcon from 'phosphor-svelte/lib/Airplane'
  import CarIcon from 'phosphor-svelte/lib/Car'
  import CurrencyDollarIcon from 'phosphor-svelte/lib/CurrencyDollar'
  import FilmStripIcon from 'phosphor-svelte/lib/FilmStrip'
  import FirstAidIcon from 'phosphor-svelte/lib/FirstAid'
  import ForkKnifeIcon from 'phosphor-svelte/lib/ForkKnife'
  import GiftIcon from 'phosphor-svelte/lib/Gift'
  import GraduationCapIcon from 'phosphor-svelte/lib/GraduationCap'
  import HouseIcon from 'phosphor-svelte/lib/House'
  import PawPrintIcon from 'phosphor-svelte/lib/PawPrint'
  import ReceiptIcon from 'phosphor-svelte/lib/Receipt'
  import ShoppingCartIcon from 'phosphor-svelte/lib/ShoppingCart'
  import TagIcon from 'phosphor-svelte/lib/Tag'

  let {
    categoryName,
    kind,
  }: {
    categoryName: string | null
    kind: MyOverview['recentTransactions'][number]['kind']
  } = $props()

  let Icon = $derived.by(() => {
    if (kind === 'income') return CurrencyDollarIcon
    const category = categoryName?.toLowerCase() ?? ''
    if (/grocer|supermarket/.test(category)) return ShoppingCartIcon
    if (/food|dining|restaurant|cafe/.test(category)) return ForkKnifeIcon
    if (/home|housing|rent|mortgage/.test(category)) return HouseIcon
    if (/transport|car|fuel|gas/.test(category)) return CarIcon
    if (/travel|flight|hotel/.test(category)) return AirplaneIcon
    if (/health|medical|pharmacy/.test(category)) return FirstAidIcon
    if (/entertainment|movie|cinema/.test(category)) return FilmStripIcon
    if (/education|school|course/.test(category)) return GraduationCapIcon
    if (/gift|donation/.test(category)) return GiftIcon
    if (/pet|animal/.test(category)) return PawPrintIcon
    if (/bill|utilit|subscription/.test(category)) return ReceiptIcon
    return categoryName ? TagIcon : ReceiptIcon
  })
</script>

<Icon class="size-4" aria-hidden="true" />
