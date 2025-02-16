import * as React from 'react';
import { useEventCallback } from '@mui/material/utils';
import { GridEvents } from '../../../constants/eventsConstants';
import { GridComponentProps } from '../../../GridComponentProps';
import { GridApiRef } from '../../../models/api/gridApiRef';
import { GridRowId } from '../../../models/gridRows';
import { GridEditRowApi } from '../../../models/api/gridEditRowApi';
import { GridCellMode } from '../../../models/gridCell';
import {
  GridCellModes,
  GridEditModes,
  GridEditRowsModel,
  GridEditCellProps,
  GridRowModes,
} from '../../../models/gridEditRowModel';
import { GridCellParams } from '../../../models/params/gridCellParams';
import { GridRowParams } from '../../../models/params/gridRowParams';
import {
  GridEditCellPropsParams,
  GridEditCellValueParams,
  GridCellEditCommitParams,
  GridCommitCellChangeParams,
} from '../../../models/params/gridEditCellParams';
import {
  isPrintableKey,
  isCellEditCommitKeys,
  isCellEnterEditModeKeys,
  isCellExitEditModeKeys,
  isDeleteKeys,
  isKeyboardEvent,
} from '../../../utils/keyboardUtils';
import {
  useGridApiEventHandler,
  useGridApiOptionHandler,
} from '../../utils/useGridApiEventHandler';
import { useGridApiMethod } from '../../utils/useGridApiMethod';
import { allGridColumnsSelector } from '../columns/gridColumnsSelector';
import { useGridLogger } from '../../utils/useGridLogger';
import { useGridState } from '../../utils/useGridState';
import { useGridSelector } from '../../utils/useGridSelector';
import { useGridStateInit } from '../../utils/useGridStateInit';
import { gridEditRowsStateSelector } from './gridEditRowsSelector';

function isPromise(promise: any): promise is Promise<GridEditCellProps> {
  return typeof promise.then === 'function';
}

/**
 * @requires useGridFocus - can be after, async only
 * @requires useGridParamsApi (method)
 * @requires useGridColumns (state)
 * @requires useGridControlState (method)
 */
export function useGridEditRows(
  apiRef: GridApiRef,
  props: Pick<
    GridComponentProps,
    | 'editRowsModel'
    | 'onEditRowsModelChange'
    | 'onEditCellPropsChange'
    | 'onCellEditCommit'
    | 'onCellEditStart'
    | 'onCellEditStop'
    | 'onRowEditCommit'
    | 'onRowEditStart'
    | 'onRowEditStop'
    | 'isCellEditable'
    | 'editMode'
  >,
) {
  const logger = useGridLogger(apiRef, 'useGridEditRows');

  useGridStateInit(apiRef, (state) => ({ ...state, editRows: {} }));
  const [, setGridState, forceUpdate] = useGridState(apiRef);
  const focusTimeout = React.useRef<any>(null);
  const nextFocusedCell = React.useRef<GridCellParams | null>(null);
  const columns = useGridSelector(apiRef, allGridColumnsSelector);

  apiRef.current.unstable_updateControlState({
    stateId: 'editRows',
    propModel: props.editRowsModel,
    propOnChange: props.onEditRowsModelChange,
    stateSelector: gridEditRowsStateSelector,
    changeEvent: GridEvents.editRowsModelChange,
  });

  const commitPropsAndExit = async (
    params: GridCellParams,
    event: MouseEvent | React.SyntheticEvent,
  ) => {
    if (params.cellMode === GridCellModes.View) {
      return;
    }
    if (props.editMode === GridEditModes.Row) {
      nextFocusedCell.current = null;
      focusTimeout.current = setTimeout(async () => {
        if (nextFocusedCell.current?.id !== params.id) {
          await apiRef.current.commitRowChange(params.id, event);
          const rowParams = apiRef.current.getRowParams(params.id);
          apiRef.current.publishEvent(GridEvents.rowEditStop, rowParams, event);
        }
      });
    } else {
      await apiRef.current.commitCellChange(params, event);
      apiRef.current.publishEvent(GridEvents.cellEditStop, params, event);
    }
  };

  const handleCellFocusIn = React.useCallback((params) => {
    nextFocusedCell.current = params;
  }, []);

  const handleCellFocusOut = useEventCallback(
    (params: GridCellParams, event: MouseEvent | React.SyntheticEvent) => {
      commitPropsAndExit(params, event);
    },
  );

  const handleColumnHeaderDragStart = useEventCallback((nativeEvent: any) => {
    const { cell } = apiRef.current.state.focus;
    if (!cell) {
      return;
    }
    const params = apiRef.current.getCellParams(cell.id, cell.field);
    commitPropsAndExit(params, nativeEvent);
  });

  const setCellMode = React.useCallback<GridEditRowApi['setCellMode']>(
    (id, field, mode: GridCellMode) => {
      const isInEditMode = apiRef.current.getCellMode(id, field) === GridCellModes.Edit;
      if (
        (mode === GridCellModes.Edit && isInEditMode) ||
        (mode === GridCellModes.View && !isInEditMode)
      ) {
        return;
      }

      logger.debug(`Switching cell id: ${id} field: ${field} to mode: ${mode}`);
      setGridState((state) => {
        const newEditRowsState: GridEditRowsModel = { ...state.editRows };
        newEditRowsState[id] = { ...newEditRowsState[id] };
        if (mode === GridCellModes.Edit) {
          newEditRowsState[id][field] = { value: apiRef.current.getCellValue(id, field) };
        } else {
          delete newEditRowsState[id][field];
          if (!Object.keys(newEditRowsState[id]).length) {
            delete newEditRowsState[id];
          }
        }
        return { ...state, editRows: newEditRowsState };
      });
      forceUpdate();
      apiRef.current.publishEvent(
        GridEvents.cellModeChange,
        apiRef.current.getCellParams(id, field),
      );
    },
    [apiRef, forceUpdate, logger, setGridState],
  );

  const setRowMode = React.useCallback<GridEditRowApi['setRowMode']>(
    (id, mode) => {
      const isInEditMode = apiRef.current.getRowMode(id) === GridRowModes.Edit;
      if (
        (mode === GridRowModes.Edit && isInEditMode) ||
        (mode === GridRowModes.View && !isInEditMode)
      ) {
        return;
      }

      setGridState((state) => {
        const newEditRowsState: GridEditRowsModel = { ...state.editRows };
        if (mode === GridRowModes.Edit) {
          newEditRowsState[id] = {};
          columns.forEach((column) => {
            const cellParams = apiRef.current.getCellParams(id, column.field);
            if (cellParams.isEditable) {
              newEditRowsState[id][column.field] = { value: cellParams.value };
            }
          });
        } else {
          delete newEditRowsState[id];
        }
        return { ...state, editRows: newEditRowsState };
      });
      forceUpdate();
    },
    [apiRef, columns, forceUpdate, setGridState],
  );

  const getRowMode = React.useCallback<GridEditRowApi['getRowMode']>(
    (id) => {
      if (props.editMode === GridEditModes.Cell) {
        return GridRowModes.View;
      }
      return apiRef.current.state.editRows[id] ? GridRowModes.Edit : GridRowModes.View;
    },
    [apiRef, props.editMode],
  );

  const getCellMode = React.useCallback<GridEditRowApi['getCellMode']>(
    (id, field) => {
      const editState = apiRef.current.state.editRows;
      const isEditing = editState[id] && editState[id][field];
      return isEditing ? GridCellModes.Edit : GridCellModes.View;
    },
    [apiRef],
  );

  const isCellEditable = React.useCallback<GridEditRowApi['isCellEditable']>(
    (params: GridCellParams) =>
      !!params.colDef.editable &&
      !!params.colDef!.renderEditCell &&
      (!props.isCellEditable || props.isCellEditable(params)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.isCellEditable],
  );

  const setEditCellValue = React.useCallback<GridEditRowApi['setEditCellValue']>(
    (params: GridEditCellValueParams, event?: React.SyntheticEvent) => {
      const newParams: GridEditCellPropsParams = {
        id: params.id,
        field: params.field,
        props: { value: params.value },
      };
      apiRef.current.publishEvent(GridEvents.editCellPropsChange, newParams, event);
    },
    [apiRef],
  );

  const setEditCellProps = React.useCallback(
    (params: GridEditCellPropsParams) => {
      const { id, field, props: editProps } = params;
      logger.debug(`Setting cell props on id: ${id} field: ${field}`);
      setGridState((state) => {
        const column = apiRef.current.getColumn(field);
        const parsedValue = column.valueParser
          ? column.valueParser(editProps.value, apiRef.current.getCellParams(id, field))
          : editProps.value;

        const editRowsModel: GridEditRowsModel = { ...state.editRows };
        editRowsModel[id] = { ...state.editRows[id] };
        editRowsModel[id][field] = { ...editProps, value: parsedValue };
        return { ...state, editRows: editRowsModel };
      });
      forceUpdate();
    },
    [apiRef, forceUpdate, logger, setGridState],
  );

  const handleEditCellPropsChange = React.useCallback(
    (params: GridEditCellPropsParams) => {
      const row = apiRef.current.getRow(params.id)!;

      if (props.editMode === 'row') {
        const model = apiRef.current.getEditRowsModel();
        const editRow = model[params.id];

        Object.keys(editRow).forEach(async (field) => {
          const column = apiRef.current.getColumn(field);
          if (column.preProcessEditCellProps) {
            const editCellProps = field === params.field ? params.props : editRow[field];
            const newEditCellProps = await Promise.resolve(
              column.preProcessEditCellProps!({ id: params.id, row, props: editCellProps }),
            );
            setEditCellProps({ id: params.id, field, props: newEditCellProps });
          } else if (field === params.field) {
            setEditCellProps(params);
          }
        });
      } else {
        const column = apiRef.current.getColumn(params.field);
        const editCellProps = column.preProcessEditCellProps
          ? column.preProcessEditCellProps({ id: params.id, row, props: params.props })
          : params.props;

        if (isPromise(editCellProps)) {
          editCellProps.then((newEditCellProps) => {
            setEditCellProps({ ...params, props: newEditCellProps });
          });
        } else {
          setEditCellProps({ ...params, props: editCellProps });
        }
      }
    },
    [apiRef, props.editMode, setEditCellProps],
  );

  const setEditRowsModel = React.useCallback<GridEditRowApi['setEditRowsModel']>(
    (model) => {
      const currentModel = gridEditRowsStateSelector(apiRef.current.state);
      if (currentModel !== model) {
        logger.debug(`Setting editRows model`);
        setGridState((state) => ({ ...state, editRows: model }));
        forceUpdate();
      }
    },
    [apiRef, forceUpdate, logger, setGridState],
  );

  const getEditRowsModel = React.useCallback<GridEditRowApi['getEditRowsModel']>(
    (): GridEditRowsModel => apiRef.current.state.editRows,
    [apiRef],
  );

  // TODO v6: explode `params` to make consistent with `commitRowChange`
  // TODO v6: it should always return a promise
  const commitCellChange = React.useCallback<GridEditRowApi['commitCellChange']>(
    (
      params: GridCommitCellChangeParams,
      event?: MouseEvent | React.SyntheticEvent,
    ): boolean | Promise<boolean> => {
      const { id, field } = params;
      const model = apiRef.current.getEditRowsModel();
      if (!model[id] || !model[id][field]) {
        throw new Error(`MUI: Cell at id: ${id} and field: ${field} is not in edit mode.`);
      }

      const editCellProps = model[id][field];
      const column = apiRef.current.getColumn(field);
      const row = apiRef.current.getRow(id)!;

      const commitParams: GridCellEditCommitParams = {
        ...params,
        value: editCellProps.value,
      };

      let hasError = !!editCellProps.error;
      if (!hasError && typeof column.preProcessEditCellProps === 'function') {
        const result = column.preProcessEditCellProps({ id, row, props: editCellProps });

        if (isPromise(result)) {
          return result.then((newEditCellProps) => {
            setEditCellProps({ id, field, props: newEditCellProps });
            if (newEditCellProps.error) {
              return false;
            }
            apiRef.current.publishEvent(GridEvents.cellEditCommit, commitParams, event);
            return true;
          });
        }

        setEditCellProps({ id, field, props: result });
        hasError = !!result.error;
      }

      if (!hasError) {
        apiRef.current.publishEvent(GridEvents.cellEditCommit, commitParams, event);
        return true;
      }

      return false;
    },
    [apiRef, setEditCellProps],
  );

  const handleCellEditCommit = React.useCallback(
    (params: GridCommitCellChangeParams) => {
      if (props.editMode === GridEditModes.Row) {
        throw new Error(`MUI: You can't commit changes when the edit mode is 'row'.`);
      }

      const { id, field } = params;
      const model = apiRef.current.getEditRowsModel();
      const { value } = model[id][field];
      logger.debug(`Setting cell id: ${id} field: ${field} to value: ${value?.toString()}`);
      const row = apiRef.current.getRow(id);
      if (row) {
        const column = apiRef.current.getColumn(params.field);
        let rowUpdate = { ...row, [field]: value };
        if (column.valueSetter) {
          rowUpdate = column.valueSetter({ row, value });
        }
        apiRef.current.updateRows([rowUpdate]);
      }
    },
    [apiRef, logger, props.editMode],
  );

  const commitRowChange = React.useCallback<GridEditRowApi['commitRowChange']>(
    (id: GridRowId, event?: React.SyntheticEvent): boolean | Promise<boolean> => {
      if (props.editMode === GridEditModes.Cell) {
        throw new Error(`MUI: You can't commit changes when the edit mode is 'cell'.`);
      }

      const model = apiRef.current.getEditRowsModel();
      const editRowProps = model[id];
      if (!editRowProps) {
        throw new Error(`MUI: Row at id: ${id} is not being edited.`);
      }

      const hasFieldWithError = Object.values(editRowProps).some((value) => !!value.error);
      if (hasFieldWithError) {
        return false;
      }

      const fieldsWithValidator = Object.keys(editRowProps).filter((field) => {
        const column = apiRef.current.getColumn(field);
        return typeof column.preProcessEditCellProps === 'function';
      });

      if (fieldsWithValidator.length > 0) {
        const row = apiRef.current.getRow(id)!;

        const validatorErrors = fieldsWithValidator.map(async (field) => {
          const column = apiRef.current.getColumn(field);
          const newEditCellProps = await Promise.resolve(
            column.preProcessEditCellProps!({ id, row, props: editRowProps[field] }),
          );
          setEditCellProps({ id, field, props: newEditCellProps });
          return newEditCellProps.error;
        });

        return Promise.all(validatorErrors).then((errors) => {
          if (errors.some((error) => !!error)) {
            return false;
          }
          apiRef.current.publishEvent(GridEvents.rowEditCommit, id, event);
          return true;
        });
      }

      apiRef.current.publishEvent(GridEvents.rowEditCommit, id, event);
      return true;
    },
    [apiRef, props.editMode, setEditCellProps],
  );

  const handleCellEditStart = React.useCallback(
    (params: GridCellParams, event: React.MouseEvent | React.KeyboardEvent) => {
      if (!params.isEditable) {
        return;
      }

      setCellMode(params.id, params.field, GridCellModes.Edit);

      if (isKeyboardEvent(event) && isPrintableKey(event.key)) {
        setEditCellProps({
          id: params.id,
          field: params.field,
          props: { value: '' },
        });
      }
    },
    [setEditCellProps, setCellMode],
  );

  const handleRowEditStart = React.useCallback(
    (params: GridRowParams) => {
      apiRef.current.setRowMode(params.id, GridRowModes.Edit);
    },
    [apiRef],
  );

  const handleRowEditStop = React.useCallback(
    (params: GridRowParams, event) => {
      apiRef.current.setRowMode(params.id, GridRowModes.View);

      if (event.key === 'Enter') {
        apiRef.current.publishEvent(GridEvents.cellNavigationKeyDown, params, event);
      }
    },
    [apiRef],
  );

  const handleRowEditCommit = React.useCallback(
    (id: GridRowId) => {
      const model = apiRef.current.getEditRowsModel();
      const editRow = model[id];
      if (!editRow) {
        throw new Error(`MUI: Row at id: ${id} is not being edited.`);
      }

      const row = apiRef.current.getRow(id);
      if (row) {
        let rowUpdate = { ...row };
        Object.keys(editRow).forEach((field) => {
          const column = apiRef.current.getColumn(field);
          const value = editRow[field].value;
          if (column.valueSetter) {
            rowUpdate = column.valueSetter({ row: rowUpdate, value });
          } else {
            rowUpdate[field] = value;
          }
        });
        apiRef.current.updateRows([rowUpdate]);
      }
    },
    [apiRef],
  );

  const preventTextSelection = React.useCallback(
    (params: GridCellParams, event: React.MouseEvent) => {
      const isMoreThanOneClick = event.detail > 1;
      if (params.isEditable && params.cellMode === GridCellModes.View && isMoreThanOneClick) {
        // If we click more than one time, then we prevent the default behavior of selecting the text cell.
        event.preventDefault();
      }
    },
    [],
  );

  const handleCellKeyDown = React.useCallback(
    async (params: GridCellParams, event) => {
      const { id, field, cellMode, isEditable } = params;
      if (!isEditable) {
        return;
      }

      const isEditMode = cellMode === GridCellModes.Edit;

      if (props.editMode === GridEditModes.Row) {
        const rowParams = apiRef.current.getRowParams(params.id);
        if (isEditMode) {
          if (event.key === 'Enter') {
            // TODO: check the return before firing GridEvents.rowEditStop
            // On cell editing, it won't exits the edit mode with error
            apiRef.current.commitRowChange(params.id);
            apiRef.current.publishEvent(GridEvents.rowEditStop, rowParams, event);
          } else if (event.key === 'Escape') {
            apiRef.current.publishEvent(GridEvents.rowEditStop, rowParams, event);
          }
        } else if (event.key === 'Enter') {
          apiRef.current.publishEvent(GridEvents.rowEditStart, rowParams, event);
        }
        return;
      }

      const isModifierKeyPressed = event.ctrlKey || event.metaKey || event.altKey;

      if (!isEditMode && isCellEnterEditModeKeys(event.key) && !isModifierKeyPressed) {
        apiRef.current.publishEvent(GridEvents.cellEditStart, params, event);
      }
      if (!isEditMode && isDeleteKeys(event.key)) {
        apiRef.current.setEditCellValue({ id, field, value: '' });
        apiRef.current.commitCellChange({ id, field }, event);
        apiRef.current.publishEvent(GridEvents.cellEditStop, params, event);
      }
      if (isEditMode && isCellEditCommitKeys(event.key)) {
        const commitParams = { id, field };
        const isValid = await apiRef.current.commitCellChange(commitParams, event);
        if (!isValid) {
          return;
        }
      }
      if (isEditMode && isCellExitEditModeKeys(event.key)) {
        apiRef.current.publishEvent(GridEvents.cellEditStop, params, event);
      }
    },
    [apiRef, props.editMode],
  );

  const handleCellEditStop = React.useCallback(
    (params: GridCellParams, event: React.SyntheticEvent | {}) => {
      setCellMode(params.id, params.field, GridCellModes.View);

      if (!isKeyboardEvent(event)) {
        return;
      }

      if (isCellEditCommitKeys(event.key)) {
        apiRef.current.publishEvent(GridEvents.cellNavigationKeyDown, params, event);
        return;
      }
      if (event.key === 'Escape' || isDeleteKeys(event.key)) {
        apiRef.current.setCellFocus(params.id, params.field);
      }
    },
    [apiRef, setCellMode],
  );

  const handleCellDoubleClick = React.useCallback(
    (params: GridCellParams, event: React.MouseEvent) => {
      if (!params.isEditable) {
        return;
      }
      if (props.editMode === GridEditModes.Row) {
        const rowParams = apiRef.current.getRowParams(params.id);
        apiRef.current.publishEvent(GridEvents.rowEditStart, rowParams, event);
      } else {
        apiRef.current.publishEvent(GridEvents.cellEditStart, params, event);
      }
    },
    [apiRef, props.editMode],
  );

  // General events
  useGridApiEventHandler(apiRef, GridEvents.cellKeyDown, handleCellKeyDown);
  useGridApiEventHandler(apiRef, GridEvents.cellMouseDown, preventTextSelection);
  useGridApiEventHandler(apiRef, GridEvents.cellDoubleClick, handleCellDoubleClick);
  useGridApiEventHandler(apiRef, GridEvents.cellFocusOut, handleCellFocusOut);
  useGridApiEventHandler(apiRef, GridEvents.cellFocusIn, handleCellFocusIn);
  useGridApiEventHandler(apiRef, GridEvents.columnHeaderDragStart, handleColumnHeaderDragStart);

  // Events shared between cell and row editing
  useGridApiEventHandler(apiRef, GridEvents.editCellPropsChange, handleEditCellPropsChange);

  // Events exclusive to cell editing
  useGridApiEventHandler(apiRef, GridEvents.cellEditStart, handleCellEditStart);
  useGridApiEventHandler(apiRef, GridEvents.cellEditStop, handleCellEditStop);
  useGridApiEventHandler(apiRef, GridEvents.cellEditCommit, handleCellEditCommit);

  // Events exclusive to row editing
  useGridApiEventHandler(apiRef, GridEvents.rowEditStart, handleRowEditStart);
  useGridApiEventHandler(apiRef, GridEvents.rowEditStop, handleRowEditStop);
  useGridApiEventHandler(apiRef, GridEvents.rowEditCommit, handleRowEditCommit);

  useGridApiOptionHandler(apiRef, GridEvents.editCellPropsChange, props.onEditCellPropsChange); // TODO v6: remove - `onEditCellPropsChange` from the column definition can be used
  useGridApiOptionHandler(apiRef, GridEvents.cellEditCommit, props.onCellEditCommit);
  useGridApiOptionHandler(apiRef, GridEvents.cellEditStart, props.onCellEditStart);
  useGridApiOptionHandler(apiRef, GridEvents.cellEditStop, props.onCellEditStop);
  useGridApiOptionHandler(apiRef, GridEvents.rowEditCommit, props.onRowEditCommit);
  useGridApiOptionHandler(apiRef, GridEvents.rowEditStart, props.onRowEditStart);
  useGridApiOptionHandler(apiRef, GridEvents.rowEditStop, props.onRowEditStop);

  useGridApiMethod<GridEditRowApi>(
    apiRef,
    {
      setCellMode,
      getCellMode,
      setRowMode,
      getRowMode,
      isCellEditable,
      commitCellChange,
      commitRowChange,
      setEditRowsModel,
      getEditRowsModel,
      setEditCellValue,
    },
    'EditRowApi',
  );

  React.useEffect(() => {
    if (props.editRowsModel !== undefined) {
      apiRef.current.setEditRowsModel(props.editRowsModel);
    }
  }, [apiRef, props.editRowsModel]);
}
