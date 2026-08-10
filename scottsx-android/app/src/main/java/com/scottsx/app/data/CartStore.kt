package com.scottsx.app.data

import com.scottsx.app.data.domain.CartItem
import com.scottsx.app.data.domain.Product
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Stage-2 in-memory cart + wishlist store.
 *
 * Future commit can swap this for a Firestore-backed repository.
 * The UI layer treats [CartStore] as a singleton — observed via
 * [StateFlow] so the cart badge and product cards update reactively
 * when the user adds or removes items.
 */
object CartStore {
    private val _items = MutableStateFlow<List<CartItem>>(emptyList())
    val items: StateFlow<List<CartItem>> = _items.asStateFlow()

    fun add(productId: String, quantity: Int = 1) {
        _items.update { current ->
            val existing = current.firstOrNull { it.productId == productId }
            if (existing != null) {
                current.map {
                    if (it.productId == productId) it.copy(quantity = it.quantity + quantity)
                    else it
                }
            } else {
                current + CartItem(productId, quantity)
            }
        }
    }

    fun remove(productId: String) {
        _items.update { current -> current.filterNot { it.productId == productId } }
    }

    fun setQuantity(productId: String, quantity: Int) {
        if (quantity <= 0) { remove(productId); return }
        _items.update { current ->
            current.map { if (it.productId == productId) it.copy(quantity = quantity) else it }
        }
    }

    fun clear() { _items.value = emptyList() }

    val totalCount: Int get() = _items.value.sumOf { it.quantity }
}

object WishlistStore {
    private val _ids = MutableStateFlow<Set<String>>(emptySet())
    val ids: StateFlow<Set<String>> = _ids.asStateFlow()

    fun toggle(productId: String): Boolean {
        var added = false
        _ids.update { current ->
            if (current.contains(productId)) {
                current - productId
            } else {
                added = true
                current + productId
            }
        }
        return added
    }

    fun contains(productId: String): Boolean = _ids.value.contains(productId)

    fun products(): List<Product> = _ids.value.mapNotNull { id ->
        MarketplaceDataSource.allProducts.firstOrNull { it.id == id }
    }

    val totalCount: Int get() = _ids.value.size
}

fun List<CartItem>.resolve(): List<Pair<Product, Int>> =
    mapNotNull { item ->
        val product = MarketplaceDataSource.allProducts.firstOrNull { it.id == item.productId }
        product?.let { it to item.quantity }
    }