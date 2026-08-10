package com.scottstechx.commerceos.ui.buyer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.scottstechx.commerceos.data.ScottsTechXRepository
import com.scottstechx.commerceos.data.auth.AuthStore
import com.scottstechx.commerceos.data.remote.ApiResult
import com.scottstechx.commerceos.data.remote.dto.OrderResponse
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OrderUiState(
    val orders: List<OrderResponse> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val trackingOrder: OrderResponse? = null
)

@HiltViewModel
class OrderViewModel @Inject constructor(
    private val repository: ScottsTechXRepository,
    private val authStore: AuthStore
) : ViewModel() {

    private val _state = MutableStateFlow(OrderUiState())
    val state: StateFlow<OrderUiState> = _state.asStateFlow()

    fun loadOrders() {
        val token = authStore.currentToken ?: return
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            when (val res = repository.listOrders(token)) {
                is ApiResult.Success -> _state.update { it.copy(isLoading = false, orders = res.value) }
                is ApiResult.HttpError -> _state.update { it.copy(isLoading = false, error = "Server error (${res.code})") }
                is ApiResult.NetworkError -> _state.update { it.copy(isLoading = false, error = "Network error") }
            }
        }
    }

    fun loadOrderDetails(orderId: String) {
        val token = authStore.currentToken ?: return
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            when (val res = repository.getOrder(token, orderId)) {
                is ApiResult.Success -> _state.update { it.copy(isLoading = false, trackingOrder = res.value) }
                is ApiResult.HttpError -> _state.update { it.copy(isLoading = false, error = "Server error (${res.code})") }
                is ApiResult.NetworkError -> _state.update { it.copy(isLoading = false, error = "Network error") }
            }
        }
    }
}
