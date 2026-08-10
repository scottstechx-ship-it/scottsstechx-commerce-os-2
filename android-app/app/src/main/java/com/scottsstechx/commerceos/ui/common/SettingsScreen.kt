package com.scottstechx.commerceos.ui.common

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.scottstechx.commerceos.data.SettingsStore
import com.scottstechx.commerceos.ui.AuthGateViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: AuthGateViewModel = hiltViewModel()
) {
    val settingsStore = viewModel.settingsStore
    val useLargeType by settingsStore.useLargeType.collectAsState()
    val useDarkMode by settingsStore.useDarkMode.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Accessibility", style = MaterialTheme.typography.titleMedium)
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Large Typography", style = MaterialTheme.typography.bodyLarge)
                    Text("Easier to read text for small screens.", style = MaterialTheme.typography.bodySmall)
                }
                Switch(
                    checked = useLargeType,
                    onCheckedChange = { settingsStore.setLargeType(it) }
                )
            }

            HorizontalDivider()

            Text("Appearance", style = MaterialTheme.typography.titleMedium)

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Dark Mode", style = MaterialTheme.typography.bodyLarge)
                    Text("Reduces eye strain in low light.", style = MaterialTheme.typography.bodySmall)
                }
                Switch(
                    checked = useDarkMode,
                    onCheckedChange = { settingsStore.setDarkMode(it) }
                )
            }
        }
    }
}
